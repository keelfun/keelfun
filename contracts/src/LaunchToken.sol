// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "solmate/src/tokens/ERC20.sol";
import {SafeTransferLib} from "solmate/src/utils/SafeTransferLib.sol";

/// @notice Fixed-supply token: the whole supply is minted once, there is no owner, mint, tax or pause.
/// With holder rewards on, it pays its share of trading fees, in the pair asset, to every holder pro rata
/// (pool, hook, factory and burn address excluded).
contract LaunchToken is ERC20 {
    using SafeTransferLib for ERC20;

    error NotHook();
    error BadValue();

    uint256 internal constant MAG = 2 ** 128;
    uint256 internal constant MIN_SHARES = 1 ether;

    address public immutable hook;
    /// @dev Asset rewards are paid in. address(0) is native ETH.
    address public immutable pair;
    bool public immutable holderRewards;

    mapping(address => bool) public excluded;
    uint256 public totalShares;
    uint256 public magPerShare;
    uint256 public undistributed;
    uint256 public totalDistributed;
    mapping(address => int256) internal corrections;
    mapping(address => uint256) public withdrawn;

    event RewardsDistributed(uint256 amount);
    event RewardsClaimed(address indexed holder, uint256 amount);

    constructor(
        string memory name_,
        string memory symbol_,
        uint256 supply,
        address recipient,
        address hook_,
        address pair_,
        bool holderRewards_,
        address[] memory excluded_
    ) ERC20(name_, symbol_, 18) {
        hook = hook_;
        pair = pair_;
        holderRewards = holderRewards_;
        for (uint256 i; i < excluded_.length; ++i) {
            excluded[excluded_[i]] = true;
        }
        excluded[recipient] = true;
        excluded[address(0)] = true;
        _mint(recipient, supply);
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        super.transfer(to, amount);
        _moveShares(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        super.transferFrom(from, to, amount);
        _moveShares(from, to, amount);
        return true;
    }

    function _moveShares(address from, address to, uint256 amount) internal {
        if (!holderRewards || amount == 0) return;
        int256 mag = int256(magPerShare * amount);
        if (!excluded[from]) {
            totalShares -= amount;
            corrections[from] += mag;
        }
        if (!excluded[to]) {
            totalShares += amount;
            corrections[to] -= mag;
        }
    }

    function sharesOf(address a) public view returns (uint256) {
        return excluded[a] ? 0 : balanceOf[a];
    }

    /// @notice Rewards earned by `a` and not yet claimed (excludes fees still sitting in the hook).
    function claimable(address a) public view returns (uint256) {
        if (!holderRewards) return 0;
        uint256 total = uint256(int256(magPerShare * sharesOf(a)) + corrections[a]) / MAG;
        return total - withdrawn[a];
    }

    /// @notice Called by the hook with the holders' share of trading fees, already sent to this contract
    /// (ERC-20 pairs) or attached as value (ETH pair).
    function distribute(uint256 amount) external payable {
        if (msg.sender != hook) revert NotHook();
        if (pair == address(0) ? msg.value != amount : msg.value != 0) revert BadValue();
        amount += undistributed;
        if (amount == 0) return;
        if (totalShares < MIN_SHARES) {
            undistributed = amount;
            return;
        }
        undistributed = 0;
        magPerShare += amount * MAG / totalShares;
        totalDistributed += amount;
        emit RewardsDistributed(amount);
    }

    /// @notice Pulls pending fees from the hook, then pays `holder` everything they are owed.
    function claim(address holder) public returns (uint256 amount) {
        try ILaunchHookFlush(hook).flushHolders(address(this)) {} catch {}
        amount = claimable(holder);
        if (amount == 0) return 0;
        withdrawn[holder] += amount;
        if (pair == address(0)) SafeTransferLib.safeTransferETH(holder, amount);
        else ERC20(pair).safeTransfer(holder, amount);
        emit RewardsClaimed(holder, amount);
    }

    function claim() external returns (uint256) {
        return claim(msg.sender);
    }
}

interface ILaunchHookFlush {
    function flushHolders(address token) external returns (uint256);
}
