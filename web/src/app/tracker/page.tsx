import { Tracker } from "@/components/Tracker";

export default function TrackerPage() {
  return (
    <div className="space-y-4 py-6">
      <div>
        <h1 className="text-xl font-bold italic">Tracker</h1>
        <p className="mt-1 text-sm text-muted">Follow any wallet and see its Keelfun buys and sells live.</p>
      </div>
      <Tracker full />
    </div>
  );
}
