open Belt

@send
external getBoundingClientRect: Dom.element => {
  "left": int,
  "right": int,
  "top": int,
  "bottom": int,
} = "getBoundingClientRect"
@send
external scrollIntoView: (
  Dom.element,
  {"behavior": string, "block": string, "inline": string},
) => unit = "scrollIntoView"
@val @scope("window") external innerHeight: int = "innerHeight"

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
  let make: {"document": State.document} => React.element
  let makeProps: (~document: State.document, ~key: string=?, unit) => {"document": State.document}
}

module rec DocumentsInner: DocumentsInnerType = {
  @react.component
  let make = React.memo((~document: State.document) => {
    let focus = Redux.useSelector(State.focus)
    let mode = Redux.useSelector(State.mode)
    let documentMap = Redux.useSelector(State.DocumentPane.map)
    let currentDocumentId = Redux.useSelector(State.DocumentPane.currentId)
    let liRef = React.useRef(Js.Nullable.null)

    let isCurrentDocument = document.id == currentDocumentId

    React.useEffect1(() => {
      if isCurrentDocument {
        liRef.current
        ->Js.Nullable.toOption
        ->Option.forEach(li => {
          let rect = li->getBoundingClientRect

          if rect["top"] < 0 {
            li->scrollIntoView({"behavior": "auto", "block": "start", "inline": "nearest"})
          }

          if rect["bottom"] > innerHeight {
            li->scrollIntoView({"behavior": "auto", "block": "end", "inline": "nearest"})
          }
        })
      }

      None
    }, [isCurrentDocument])

    let className = if isCurrentDocument {
      switch focus {
      | State.DocumentPane => Style.currentFocused

      | _ => Style.currentUnfocused
      }
    } else {
      ""
    }

    <>
      <li className ref={ReactDOM.Ref.domRef(liRef)}>
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
