open Belt

%%private(
  let makeChildren = (documentMap, document: State.Document.t) => {
    let children = []

    let currentDocument = ref(documentMap->HashMap.String.get(document.firstChildId))

    while Option.isSome(currentDocument.contents) {
      let document: State.Document.t = Option.getExn(currentDocument.contents)

      let _ = children->Js.Array2.push(document)
      currentDocument := documentMap->HashMap.String.get(document.nextId)
    }

    children
  }
)

module type DocumentsInnerType = {
  let make: {"document": State.Document.t} => ReasonReact.reactElement
  let makeProps: (~document: State.Document.t, ~key: string=?, unit) => {"document": State.Document.t}
}

module rec DocumentsInner: DocumentsInnerType = {
  @react.component
  let make = React.memo((~document: State.Document.t) => {
    let documentMap = Redux.useSelector(State.documentMap)

    <>
      <li> <Document document /> </li>
      <ul>
        {makeChildren(documentMap, document)
        ->Array.map((document: State.Document.t) => {
          <DocumentsInner key=document.id document />
        })
        ->React.array}
      </ul>
    </>
  })
}

@react.component
let make = React.memo(() => {
  let documentMap = Redux.useSelector(State.documentMap)
  let rootDocument = Redux.useSelector(State.rootDocument)

  <section className=Style.documents>
    {switch rootDocument {
    | Some(rootDocument) =>
      <ul>
        {makeChildren(documentMap, rootDocument)
        ->Array.map((document: State.Document.t) => <DocumentsInner key=document.id document />)
        ->React.array}
      </ul>

    | None => React.null
    }}
  </section>
})

React.setDisplayName(make, "Documents")
