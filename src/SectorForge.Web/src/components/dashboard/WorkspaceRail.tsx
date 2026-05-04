import {
  Activity,
  Gauge,
  GitCompareArrows,
  ListOrdered,
  Plug,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";

export type Workspace = "live" | "driver" | "sessions" | "compare" | "adapters";

type WorkspaceItem = {
  id: Workspace;
  label: string;
  caption: string;
  icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;
};

const WORKSPACES: WorkspaceItem[] = [
  { id: "live", label: "Live", caption: "Pitwall feed", icon: Activity },
  { id: "driver", label: "Driver", caption: "HUD glance", icon: Gauge },
  {
    id: "sessions",
    label: "Sessions",
    caption: "Stints · laps",
    icon: ListOrdered,
  },
  {
    id: "compare",
    label: "Compare",
    caption: "Overlay laps",
    icon: GitCompareArrows,
  },
  { id: "adapters", label: "Adapters", caption: "Inputs", icon: Plug },
];

type WorkspaceRailProps = {
  active: Workspace;
  onSelect: (workspace: Workspace) => void;
  isReplayRunning: boolean;
  compareBasketCount?: number;
};

export function WorkspaceRail({
  active,
  onSelect,
  isReplayRunning,
  compareBasketCount = 0,
}: WorkspaceRailProps) {
  return (
    <nav className="workspace-rail" aria-label="Workspaces">
      <div className="workspace-rail-brand" aria-hidden="true">
        <img className="workspace-rail-brand-mark" src="/favicon.svg" alt="" />
      </div>
      <ul className="workspace-rail-list">
        {WORKSPACES.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id;
          const showReplayMark = item.id === "sessions" && isReplayRunning;
          const compareCount = item.id === "compare" ? compareBasketCount : 0;
          const showCompareCount = compareCount > 0;
          return (
            <li key={item.id}>
              <button
                type="button"
                className={`workspace-rail-item${isActive ? " active" : ""}`}
                aria-current={isActive ? "page" : undefined}
                aria-label={
                  showCompareCount
                    ? `${item.label}, ${compareCount} pinned ${
                        compareCount === 1 ? "lap" : "laps"
                      }`
                    : undefined
                }
                onClick={() => onSelect(item.id)}
              >
                <span className="workspace-rail-icon">
                  <Icon size={18} />
                  {showReplayMark && (
                    <span className="workspace-rail-pulse" aria-hidden="true" />
                  )}
                  {showCompareCount && (
                    <span className="workspace-rail-count" aria-hidden="true">
                      {compareCount}
                    </span>
                  )}
                </span>
                <span className="workspace-rail-text">
                  <span className="workspace-rail-label">{item.label}</span>
                  <span className="workspace-rail-caption">{item.caption}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
