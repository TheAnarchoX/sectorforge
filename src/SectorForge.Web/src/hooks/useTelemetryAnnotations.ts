import { useCallback, useEffect, useMemo, useState } from "react";
import {
  compareAnnotationsByUpdatedAt,
  createTelemetryAnnotation,
  readStoredTelemetryAnnotations,
  writeStoredTelemetryAnnotations,
  type TelemetryAnnotation,
  type TelemetryAnnotationInput,
} from "../utils/telemetryAnnotations";

export type UseTelemetryAnnotationsOptions = {
  storageKey?: string;
};

export function useTelemetryAnnotations(
  options: UseTelemetryAnnotationsOptions = {},
) {
  const storageKey = options.storageKey;
  const [annotations, setAnnotations] = useState<TelemetryAnnotation[]>(() =>
    readStoredTelemetryAnnotations(storageKey),
  );

  useEffect(() => {
    writeStoredTelemetryAnnotations(annotations, storageKey);
  }, [annotations, storageKey]);

  const addAnnotation = useCallback((input: TelemetryAnnotationInput) => {
    const annotation = createTelemetryAnnotation(input);
    if (annotation === null) {
      return null;
    }

    setAnnotations((currentAnnotations) =>
      [annotation, ...currentAnnotations].sort(compareAnnotationsByUpdatedAt),
    );
    return annotation;
  }, []);

  const updateAnnotation = useCallback(
    (annotationId: string, input: Partial<TelemetryAnnotationInput>) => {
      setAnnotations((currentAnnotations) =>
        currentAnnotations
          .map((annotation) =>
            annotation.id === annotationId
              ? {
                  ...annotation,
                  ...input,
                  note: input.note ?? annotation.note,
                  tags: input.tags ?? annotation.tags,
                  updatedAt: new Date().toISOString(),
                }
              : annotation,
          )
          .sort(compareAnnotationsByUpdatedAt),
      );
    },
    [],
  );

  const deleteAnnotation = useCallback((annotationId: string) => {
    setAnnotations((currentAnnotations) =>
      currentAnnotations.filter((annotation) => annotation.id !== annotationId),
    );
  }, []);

  const importAnnotations = useCallback(
    (nextAnnotations: TelemetryAnnotation[]) => {
      setAnnotations((currentAnnotations) => {
        const byId = new Map<string, TelemetryAnnotation>();
        for (const annotation of currentAnnotations) {
          byId.set(annotation.id, annotation);
        }
        for (const annotation of nextAnnotations) {
          byId.set(annotation.id, annotation);
        }
        return Array.from(byId.values()).sort(compareAnnotationsByUpdatedAt);
      });
    },
    [],
  );

  return useMemo(
    () => ({
      annotations,
      addAnnotation,
      updateAnnotation,
      deleteAnnotation,
      importAnnotations,
    }),
    [
      addAnnotation,
      annotations,
      deleteAnnotation,
      importAnnotations,
      updateAnnotation,
    ],
  );
}
