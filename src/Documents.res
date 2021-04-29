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
    let documentMap = Redux.useSelector(State.Document.map)

    <>
      <li> <Document document /> </li>
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
let make = React.memo(() => {
  let documentMap = Redux.useSelector(State.Document.map)
  let rootDocument = Redux.useSelector(State.Document.root)

  <section className=Style.documents>
    {switch rootDocument {
    | Some(rootDocument) =>
      <ul>
        {makeChildren(documentMap, rootDocument)
        ->Array.map((document: State.document) => <DocumentsInner key=document.id document />)
        ->React.array}
      </ul>

    | None => React.null
    }}
  </section>
})

React.setDisplayName(make, "Documents")
