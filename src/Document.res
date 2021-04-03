open Belt

@react.component
let make = (~mode, ~currentDocumentItemId, ~documentItemMap, ~currentDocumentId, ~documentMap) => {
  switch documentMap->HashMap.String.get(currentDocumentId) {
  | Some({rootItemId}: State.document) => switch documentItemMap->HashMap.String.get(rootItemId) {
    | Some(item) => <section className=Style.document><Items item mode currentDocumentItemId documentItemMap /></section>

    | None => React.null
    }

  | None => React.null
  }
}
