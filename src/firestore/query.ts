import {
  type CollectionReference,
  type OrderByDirection,
  type Query,
  type QueryConstraint,
  type WhereFilterOp,
  limit as firestoreLimit,
  orderBy as firestoreOrderBy,
  query as firestoreQuery,
  where as firestoreWhere,
} from "firebase/firestore";

export type WhereConstraint = {
  kind: "where";
  fieldPath: string;
  op: WhereFilterOp;
  value: unknown;
  constraint: QueryConstraint;
};

export type OrderByConstraint = {
  kind: "orderBy";
  fieldPath: string;
  direction: OrderByDirection;
  constraint: QueryConstraint;
};

export type LimitConstraint = {
  kind: "limit";
  count: number;
  overfetchCount: number;
  constraint: QueryConstraint;
};

export type LimitOptions = {
  overfetchCount?: number;
};

export type QueryConstraintWithMetadata = WhereConstraint | OrderByConstraint | LimitConstraint;
export type QueryConstraintInput = QueryConstraintWithMetadata | QueryConstraint;

export type QueryWithMetadata<T extends object> = {
  query: Query<T>;
  collection: string;
  filters: WhereConstraint[];
  orderBys: OrderByConstraint[];
  limit?: number;
  hasUntrackedConstraints: boolean;
};

export function where(fieldPath: string, op: WhereFilterOp, value: unknown): WhereConstraint {
  return {
    kind: "where",
    fieldPath,
    op,
    value,
    constraint: firestoreWhere(fieldPath, op, value),
  };
}

export function orderBy(fieldPath: string, direction: OrderByDirection = "asc"): OrderByConstraint {
  return {
    kind: "orderBy",
    fieldPath,
    direction,
    constraint: firestoreOrderBy(fieldPath, direction),
  };
}

export function limit(count: number, options?: LimitOptions): LimitConstraint {
  const overfetchCount = options?.overfetchCount ?? 2;
  return {
    kind: "limit",
    count,
    overfetchCount,
    constraint: firestoreLimit(count + overfetchCount),
  };
}

export function query<T extends object>(
  col: CollectionReference<T> & { readonly id: string },
  ...constraints: QueryConstraintInput[]
): QueryWithMetadata<T> {
  const metadataConstraints = constraints.filter(isQueryConstraintWithMetadata);
  const sdkConstraints = constraints.flatMap((c) =>
    isQueryConstraintWithMetadata(c) ? [c.constraint] : [c],
  );
  const limitConstraints = metadataConstraints.filter((c): c is LimitConstraint => c.kind === "limit");
  return {
    query: firestoreQuery(col, ...sdkConstraints),
    collection: col.id,
    filters: metadataConstraints.filter((c): c is WhereConstraint => c.kind === "where"),
    orderBys: metadataConstraints.filter((c): c is OrderByConstraint => c.kind === "orderBy"),
    limit: limitConstraints.at(-1)?.count,
    hasUntrackedConstraints: metadataConstraints.length !== constraints.length,
  };
}

function isQueryConstraintWithMetadata(c: QueryConstraintInput): c is QueryConstraintWithMetadata {
  return "kind" in c;
}
