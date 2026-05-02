export function formatNumber(value: number | null | undefined, decimals: number) {
  return value === null || value === undefined ? "-" : value.toFixed(decimals);
}

export function formatGear(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "-";
  }

  return value === 0 ? "N" : String(value);
}

export function formatTime(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  const negative = value.startsWith("-");
  const clean = negative ? value.slice(1) : value;
  const daySplit = clean.split(".");
  const timePart =
    daySplit.length === 2 && daySplit[0].includes(":")
      ? clean
      : (daySplit.at(-1) ?? clean);
  const [hours = "0", minutes = "0", secondsRaw = "0"] = timePart.split(":");
  const seconds = Number(secondsRaw);
  const totalMinutes = Number(hours) * 60 + Number(minutes);
  const formatted = `${String(totalMinutes).padStart(2, "0")}:${seconds.toFixed(3).padStart(6, "0")}`;

  return negative ? `-${formatted}` : formatted;
}

export function formatDelta(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  return value.startsWith("-") ? formatTime(value) : `+${formatTime(value)}`;
}

export function formatShortTimestamp(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    return "-";
  }

  const date = timestamp.toLocaleDateString(undefined, {
    month: "2-digit",
    day: "2-digit",
  });
  const time = timestamp.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return `${date} ${time}`;
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
