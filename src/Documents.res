open Belt

%%private(
  let makeChildren = (documentMap, document: State.document) => {
    let children = []

    let currentDocument = ref(documentMap->HashMap.String.get(document.firstChildId))

    while Option.isSome(currentDocument.contents) {
      let document: State.document = Option.getExn(currentDocument.contents)

      let _ = children->Js.Array2.push(document)
      currentDocument := documentMap->HashMap.String.get(document.nextId)
    }

    children
  }
)

module type DocumentsInnerType = {
  let make: {"document": State.document} => ReasonReact.reactElement
  let makeProps: (~document: State.document, ~key: string=?, unit) => {"document": State.document}
}

module rec DocumentsInner: DocumentsInnerType = {
  @react.component
  let make = React.memo((~document: State.document) => {
    let focus = Redux.useSelector(State.focus)
    let mode = Redux.useSelector(State.mode)
    let documentMap = Redux.useSelector(State.DocumentPane.map)
    let currentDocumentId = Redux.useSelector(State.DocumentPane.currentId)

    let isCurrentDocument = document.id == currentDocumentId

    let className = if isCurrentDocument {
      switch focus {
      | State.DocumentPane => Style.currentFocused

      | _ => Style.currentUnfocused
      }
    } else {
      ""
    }

    <>
      <li className>
        {switch (focus, mode, isCurrentDocument) {
        | (State.DocumentPane, State.Insert(_), true) => <DocumentEditor />

        | _ => <Document document />
        }}
      </li>
      <ul>
        {makeChildren(documentMap, document)
        ->Array.map((document: State.document) => {
          <DocumentsInner key=document.id document />
        })
        ->React.array}
      </ul>
    </>
  })
}

@react.component
let make = React.memo((~document: State.document) => {
  let documentMap = Redux.useSelector(State.DocumentPane.map)

  <ul>
    {makeChildren(documentMap, document)
    ->Array.map((document: State.document) => <DocumentsInner key=document.id document />)
    ->React.array}
  </ul>
})

React.setDisplayName(make, "Documents")
