type IconName = "check" | "x" | "clock" | "chart";

const iconPaths: Record<IconName, string> = {
  check:
    "M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z",
  x: "M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z",
  clock:
    "M8 1.5a.5.5 0 0 1 .5.5v5.793l3.354 3.353a.5.5 0 0 1-.708.708l-3.5-3.5A.5.5 0 0 1 7.5 8V2a.5.5 0 0 1 .5-.5z",
  chart:
    "M1.5 13.5a.5.5 0 0 1 .5-.5h12a.5.5 0 0 1 0 1H2a.5.5 0 0 1-.5-.5zM3 11.5a.5.5 0 0 1-.5-.5V7a.5.5 0 0 1 1 0v4a.5.5 0 0 1-.5.5zm4 0a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 1 0v7a.5.5 0 0 1-.5.5zm4 0a.5.5 0 0 1-.5-.5V2a.5.5 0 0 1 1 0v9a.5.5 0 0 1-.5.5z",
};

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg className={className} aria-hidden="true" viewBox="0 0 16 16" focusable="false">
      <path d={iconPaths[name]} />
    </svg>
  );
}
