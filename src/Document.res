open Belt

@react.component
let make = (~mode, ~currentItemId, ~itemsMap, ~currentDocumentId, ~documentsMap) => {
  switch documentsMap->HashMap.String.get(currentDocumentId) {
  | Some(State.Document({rootItemId})) => switch itemsMap->HashMap.String.get(rootItemId) {
    | Some(item) => <Items item mode currentItemId itemsMap />
    | _ => React.null
    }

  | _ => React.null
  }
}
