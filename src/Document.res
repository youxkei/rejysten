open Belt

@react.component
let make = () => {
  let documentsMap = Redux.useSelector(State.documentsMap)
  let currentDocument = Redux.useSelector(State.currentDocument)

  let itemsMap = Redux.useSelector(State.itemsMap)

  switch documentsMap->HashMap.String.get(currentDocument) {
  | Some(State.Document({rootItem})) => switch itemsMap->HashMap.String.get(rootItem) {
    | Some(item) => <Items item />
    | _ => React.array([])
    }

  | _ => React.array([])
  }
}
