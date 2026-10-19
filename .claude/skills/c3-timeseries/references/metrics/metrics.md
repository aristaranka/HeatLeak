# C3 AI Metrics

The C3 AI metric system lets you define reusable calculations on entity types. **SimpleMetrics** compute values from timeseries or expressions on a source type; **CompoundMetrics** compose metrics with expression-engine logic. Subject types typically mix **FeatureEvaluatable**, which is the modern entry point for metric evaluation and mixes the deprecated **MetricEvaluatable** APIs.

## Quick Reference

| Operation                          | How                                                                                                             |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| List metrics for a type            | `MySubject.listMetrics()`                                                                                       |
| Evaluate single metric             | `MySubject.evalMetric(EvalMetricSpec.make({expression: '...', id: 'subject-1', start, end, interval}))`         |
| Evaluate multiple metrics          | `MySubject.evalMetrics(EvalMetricsSpec.make({expressions: ['...'], ids: ['subject-1'], start, end, interval}))` |
| Evaluate with metadata / overrides | `MySubject.evalMetricsWithMetadata(spec, overrideMetrics)`                                                      |
| Rollup metric                      | `MySubject.rollupMetric(spec)`                                                                                  |
| Lookup SimpleMetric by id          | `SimpleMetric.metricForId('MyMetric_MyType')`                                                                   |
| List all SimpleMetrics             | `SimpleMetric.metrics()`                                                                                        |
| List CompoundMetric descendants    | `CompoundMetric.getDescendants(expression, SourceType)`                                                         |
| List SimpleMetrics in compound     | `CompoundMetric.listSimpleMetrics(expression, SourceType)`                                                      |
| Invalidate metric cache            | `SimpleMetric.invalidateCache([MetricInvalidationSpec.make({...})])`                                            |

## Architecture

```
Metric (abstract, mixes Metadata)
├── SimpleMetric (mixes Metric, Identified)
│     Modes: EXPRESSION, ASTIMESERIES, ACTION
└── CompoundMetric (mixes Metric, Identified)
      Composes metrics via expressions

FeatureEvaluatable (modern mixin; mixes deprecated MetricEvaluatable + Fetchable + Evaluatable)
      Metric evaluation: evalMetric(), evalMetrics(), listMetrics(), rollupMetric(), ...
      Feature evaluation: features(), evalFeature(), evalFeatureSet(), evalFeatureSetBatch()
```

## How Pieces Fit Together

1. Define **SimpleMetrics** on a source type using `expression`, `tsDecl`, or `actionDecl`.
2. Compose those metrics with **CompoundMetrics**. Compound expressions reference metric **names**, not ids.
3. Evaluate metrics on subject types that mix **FeatureEvaluatable**.
4. Add `variables`, `cache`, and `explain: true` when you need parameterization, precomputation, or plan inspection.

## References (load only when needed)

- [metric-types.md](metric-types.md) for `SimpleMetric`, `TSDecl`, `ActionMetricDecl`, `CompoundMetric`, `MetricVariable`, and `MetricContext`.
- [feature-evaluatable.md](feature-evaluatable.md) for subject-type requirements, metric APIs, feature APIs, and the subject/header/data-point model.
- [evaluation-specs.md](evaluation-specs.md) for `EvalMetricsSpec`, `EvalMetricSpec`, and `EvalMetricsResult`.
- [examples.md](examples.md) for seed-data examples, validation examples, and end-to-end evaluation snippets.
- [caching.md](caching.md) for `SimpleMetricCacheSpec`, cache examples, and cache caveats.
- [utilities-and-guidance.md](utilities-and-guidance.md) for `MetricUtils`, best practices, and limitations.
