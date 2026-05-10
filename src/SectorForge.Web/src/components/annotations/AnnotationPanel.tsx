import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent, ReactNode } from "react";
import {
  ChevronDown,
  ChevronRight,
  Edit3,
  Search,
  Tags,
  Trash2,
  X,
} from "lucide-react";
import {
  TELEMETRY_ANNOTATION_CATEGORIES,
  createAnnotationContextId,
  formatAnnotationMoment,
  normalizeAnnotationTags,
  type TelemetryAnnotation,
  type TelemetryAnnotationInput,
  type TelemetryAnnotationScope,
} from "../../utils/telemetryAnnotations";

export type AnnotationContextOption = {
  id: string;
  label: string;
  scope: TelemetryAnnotationScope;
  sessionId: string;
  lapNumber?: number | null;
  startTimeSeconds?: number | null;
  endTimeSeconds?: number | null;
  distanceMeters?: number | null;
  endDistanceMeters?: number | null;
};

export type AnnotationDraft = AnnotationContextOption;

type AnnotationPanelProps = {
  title: string;
  annotations: TelemetryAnnotation[];
  contextOptions: AnnotationContextOption[];
  draft?: AnnotationDraft | null;
  onDraftConsumed?: () => void;
  onAddAnnotation: (input: TelemetryAnnotationInput) => void;
  onUpdateAnnotation: (
    annotationId: string,
    input: Partial<TelemetryAnnotationInput>,
  ) => void;
  onDeleteAnnotation: (annotationId: string) => void;
  onSelectAnnotation?: (annotation: TelemetryAnnotation) => void;
  defaultCollapsed?: boolean;
  headerAction?: ReactNode;
};

type AnnotationFormState = {
  contextId: string;
  note: string;
  category: string;
  tags: string;
};

function getDefaultContextId(options: AnnotationContextOption[]) {
  return options[0]?.id ?? "";
}

function getAnnotationContextId(annotation: TelemetryAnnotation) {
  return createAnnotationContextId(annotation);
}

function contextFromAnnotation(annotation: TelemetryAnnotation) {
  const moment = formatAnnotationMoment(annotation);
  const lapText =
    annotation.lapNumber === null || annotation.lapNumber === undefined
      ? "session"
      : `lap ${annotation.lapNumber}`;
  return {
    id: getAnnotationContextId(annotation),
    label:
      annotation.scope === "moment" && moment !== null
        ? `Moment ${moment} / ${lapText} / ${annotation.sessionId.slice(0, 8)}`
        : `${annotation.scope} / ${lapText} / ${annotation.sessionId.slice(0, 8)}`,
    scope: annotation.scope,
    sessionId: annotation.sessionId,
    lapNumber: annotation.lapNumber,
    startTimeSeconds: annotation.startTimeSeconds,
    endTimeSeconds: annotation.endTimeSeconds,
    distanceMeters: annotation.distanceMeters,
    endDistanceMeters: annotation.endDistanceMeters,
  } satisfies AnnotationContextOption;
}

function mergeContextOptions(
  options: AnnotationContextOption[],
  annotations: TelemetryAnnotation[],
  draft: AnnotationDraft | null | undefined,
) {
  const byId = new Map<string, AnnotationContextOption>();
  for (const option of options) {
    byId.set(option.id, option);
  }
  for (const annotation of annotations) {
    const option = contextFromAnnotation(annotation);
    if (!byId.has(option.id)) {
      byId.set(option.id, option);
    }
  }
  if (draft !== null && draft !== undefined) {
    byId.set(draft.id, draft);
  }
  return Array.from(byId.values());
}

function annotationMatchesSearch(
  annotation: TelemetryAnnotation,
  searchText: string,
  tagFilter: string,
) {
  const normalizedSearch = searchText.trim().toLowerCase();
  const normalizedTag = tagFilter.trim().toLowerCase();
  const textHaystack = [
    annotation.note,
    annotation.category ?? "",
    annotation.tags.join(" "),
    annotation.sessionId,
    annotation.lapNumber?.toString() ?? "",
  ]
    .join(" ")
    .toLowerCase();

  return (
    (normalizedSearch === "" || textHaystack.includes(normalizedSearch)) &&
    (normalizedTag === "" || annotation.tags.includes(normalizedTag))
  );
}

function getContextLabel(
  annotation: TelemetryAnnotation,
  contextOptions: AnnotationContextOption[],
) {
  const id = getAnnotationContextId(annotation);
  return (
    contextOptions.find((option) => option.id === id)?.label ??
    contextFromAnnotation(annotation).label
  );
}

function getEmptyFormState(contextOptions: AnnotationContextOption[]) {
  return {
    contextId: getDefaultContextId(contextOptions),
    note: "",
    category: TELEMETRY_ANNOTATION_CATEGORIES[0],
    tags: "",
  } satisfies AnnotationFormState;
}

export function AnnotationPanel({
  title,
  annotations,
  contextOptions,
  draft,
  onDraftConsumed,
  onAddAnnotation,
  onUpdateAnnotation,
  onDeleteAnnotation,
  onSelectAnnotation,
  defaultCollapsed = true,
  headerAction,
}: AnnotationPanelProps) {
  const mergedContextOptions = useMemo(
    () => mergeContextOptions(contextOptions, annotations, draft),
    [annotations, contextOptions, draft],
  );
  const [formState, setFormState] = useState<AnnotationFormState>(() =>
    getEmptyFormState(mergedContextOptions),
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  useEffect(() => {
    if (draft === null || draft === undefined) {
      return;
    }

    // Syncs the external chart/lap draft into the editor selection.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFormState((currentState) => ({
      ...currentState,
      contextId: draft.id,
    }));
    setIsCollapsed(false);
    onDraftConsumed?.();
  }, [draft, onDraftConsumed]);

  useEffect(() => {
    // Keeps the selected editor context valid after the available contexts change.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFormState((currentState) => {
      if (
        currentState.contextId !== "" &&
        mergedContextOptions.some(
          (option) => option.id === currentState.contextId,
        )
      ) {
        return currentState;
      }

      return {
        ...currentState,
        contextId: getDefaultContextId(mergedContextOptions),
      };
    });
  }, [mergedContextOptions]);

  const tags = useMemo(
    () =>
      Array.from(
        new Set(annotations.flatMap((annotation) => annotation.tags)),
      ).sort(),
    [annotations],
  );
  const filteredAnnotations = useMemo(
    () =>
      annotations.filter((annotation) =>
        annotationMatchesSearch(annotation, searchText, tagFilter),
      ),
    [annotations, searchText, tagFilter],
  );
  const selectedContext = mergedContextOptions.find(
    (option) => option.id === formState.contextId,
  );

  const handleChange = (
    field: keyof AnnotationFormState,
    event: ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    setFormState((currentState) => ({
      ...currentState,
      [field]: event.target.value,
    }));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (selectedContext === undefined || formState.note.trim() === "") {
      return;
    }

    const input = {
      scope: selectedContext.scope,
      sessionId: selectedContext.sessionId,
      lapNumber: selectedContext.lapNumber ?? null,
      note: formState.note,
      tags: normalizeAnnotationTags(formState.tags),
      category: formState.category,
      startTimeSeconds: selectedContext.startTimeSeconds ?? null,
      endTimeSeconds: selectedContext.endTimeSeconds ?? null,
      distanceMeters: selectedContext.distanceMeters ?? null,
      endDistanceMeters: selectedContext.endDistanceMeters ?? null,
    } satisfies TelemetryAnnotationInput;

    if (editingId === null) {
      onAddAnnotation(input);
    } else {
      onUpdateAnnotation(editingId, input);
    }

    setEditingId(null);
    setFormState({
      ...getEmptyFormState(mergedContextOptions),
      contextId: selectedContext.id,
    });
  };

  const handleEdit = (annotation: TelemetryAnnotation) => {
    const contextId = getAnnotationContextId(annotation);
    setEditingId(annotation.id);
    setFormState({
      contextId,
      note: annotation.note,
      category: annotation.category ?? TELEMETRY_ANNOTATION_CATEGORIES[0],
      tags: annotation.tags.join(", "),
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setFormState(getEmptyFormState(mergedContextOptions));
  };

  return (
    <section className="annotation-panel" aria-label={title}>
      <header className="zone-bar annotation-panel-bar">
        <div className="zone-bar-title">
          <span className="zone-kicker">Annotations</span>
          <span className="zone-source">{title}</span>
        </div>
        <div className="zone-bar-meta mono">
          <span>
            {annotations.length} {annotations.length === 1 ? "note" : "notes"}
          </span>
          {headerAction}
          <button
            type="button"
            className="icon-button annotation-collapse-button"
            aria-expanded={!isCollapsed}
            onClick={() => setIsCollapsed((currentValue) => !currentValue)}
          >
            {isCollapsed ? (
              <ChevronRight size={13} />
            ) : (
              <ChevronDown size={13} />
            )}
            {isCollapsed ? "Open" : "Hide"}
          </button>
        </div>
      </header>

      {isCollapsed ? null : (
        <div className="annotation-panel-grid">
          <form className="annotation-editor" onSubmit={handleSubmit}>
            <label className="annotation-field">
              <span>Context</span>
              <select
                value={formState.contextId}
                onChange={(event) => handleChange("contextId", event)}
                disabled={mergedContextOptions.length === 0}
              >
                {mergedContextOptions.length === 0 && (
                  <option value="">No session context</option>
                )}
                {mergedContextOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="annotation-field annotation-field-note">
              <span>Note</span>
              <textarea
                value={formState.note}
                rows={3}
                onChange={(event) => handleChange("note", event)}
              />
            </label>
            <div className="annotation-field-row">
              <label className="annotation-field">
                <span>Category</span>
                <select
                  value={formState.category}
                  onChange={(event) => handleChange("category", event)}
                >
                  {TELEMETRY_ANNOTATION_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>
              <label className="annotation-field">
                <span>Tags</span>
                <input
                  value={formState.tags}
                  onChange={(event) => handleChange("tags", event)}
                />
              </label>
            </div>
            <div className="annotation-editor-actions">
              <button
                type="submit"
                className="icon-button primary"
                disabled={
                  selectedContext === undefined || formState.note.trim() === ""
                }
              >
                <Tags size={13} />{" "}
                {editingId === null ? "Add note" : "Save note"}
              </button>
              {editingId !== null && (
                <button
                  type="button"
                  className="icon-button"
                  onClick={handleCancelEdit}
                >
                  <X size={13} /> Cancel
                </button>
              )}
            </div>
          </form>

          <div className="annotation-discovery" aria-label="Annotation search">
            <div className="annotation-search-row">
              <label className="annotation-search-field">
                <Search size={13} aria-hidden="true" />
                <input
                  aria-label="Search annotations"
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                />
              </label>
              <select
                className="annotation-tag-filter"
                aria-label="Filter annotations by tag"
                value={tagFilter}
                onChange={(event) => setTagFilter(event.target.value)}
              >
                <option value="">All tags</option>
                {tags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
            </div>

            <div className="annotation-list" role="list">
              {filteredAnnotations.length === 0 ? (
                <div className="annotation-empty" role="status">
                  No annotations match the current filters.
                </div>
              ) : (
                filteredAnnotations.map((annotation) => (
                  <article
                    key={annotation.id}
                    className="annotation-card"
                    role="listitem"
                  >
                    <div className="annotation-card-head">
                      <span className="annotation-context">
                        {getContextLabel(annotation, mergedContextOptions)}
                      </span>
                      <span className="annotation-date mono">
                        {new Date(annotation.updatedAt).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="annotation-note">{annotation.note}</p>
                    <div className="annotation-meta-row">
                      {annotation.category && (
                        <span className="annotation-category">
                          {annotation.category}
                        </span>
                      )}
                      {annotation.tags.map((tag) => (
                        <span className="annotation-tag" key={tag}>
                          {tag}
                        </span>
                      ))}
                    </div>
                    <div className="annotation-card-actions">
                      {onSelectAnnotation !== undefined && (
                        <button
                          type="button"
                          className="compare-overlay-reference-button"
                          onClick={() => onSelectAnnotation(annotation)}
                        >
                          View
                        </button>
                      )}
                      <button
                        type="button"
                        className="compare-overlay-reference-button"
                        aria-label={`Edit annotation ${annotation.note}`}
                        onClick={() => handleEdit(annotation)}
                      >
                        <Edit3 size={11} /> Edit
                      </button>
                      <button
                        type="button"
                        className="compare-overlay-reference-button danger"
                        aria-label={`Delete annotation ${annotation.note}`}
                        onClick={() => onDeleteAnnotation(annotation.id)}
                      >
                        <Trash2 size={11} /> Delete
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
