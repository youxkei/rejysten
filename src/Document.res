open Belt

@react.component
let make = (~mode, ~currentItemId, ~itemsMap, ~currentDocumentId, ~documentsMap) => {
  switch documentsMap->HashMap.String.get(currentDocumentId) {
  | Some({rootItemId}: State.document) => switch itemsMap->HashMap.String.get(rootItemId) {
    | Some(item) => <Items item mode currentItemId itemsMap />

    | None => React.null
    }

  | None => React.null
  }
}
