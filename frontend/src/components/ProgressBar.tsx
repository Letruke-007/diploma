type Props = {
  percent: number;
};

export function ProgressBar({ percent }: Props) {
  const width = Math.max(0, Math.min(100, percent));

  return (
    <div className="w-full bg-gray-200 rounded-xl h-3 overflow-hidden">
      <div
        className="h-3 rounded-xl transition-[width] duration-200 ease-out"
        style={{ width: `${width}%` }}
      />
    </div>
  );
}
