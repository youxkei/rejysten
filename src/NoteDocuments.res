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

    let currentDocument = ref(documentMap->Map.String.get(document.firstChildId))

    while Belt.Option.isSome(currentDocument.contents) {
      let document: State.document = Option.getExn(currentDocument.contents)

      let _ = children->Js.Array2.push(document)
      currentDocument := documentMap->Map.String.get(document.nextId)
    }

    children
  }
)

module rec DocumentsInner: {
  let make: {"document": State.document} => ReasonReact.reactElement
  let makeProps: (~document: State.document, ~key: string=?, unit) => {"document": State.document}
} = {
  @react.component
  let make = React.memo((~document: State.document) => {
    let focus = Redux.useSelector(State.focus)
    let mode = Redux.useSelector(State.mode)
    let documentMap = Redux.useSelector(State.Note.DocumentPane.documentMap)
    let currentDocumentId = Redux.useSelector(State.Note.DocumentPane.currentDocumentId)
    let listItemRef = React.useRef(Js.Nullable.null)

    let isCurrentDocument = document.id == currentDocumentId

    let focused = if isCurrentDocument {
      Style.focused
    } else {
      ""
    }

    React.useEffect1(() => {
      if isCurrentDocument {
        listItemRef.current
        ->Js.Nullable.toOption
        ->Option.forEach(listItem => {
          let rect = listItem->getBoundingClientRect

          if rect["top"] < 0 {
            listItem->scrollIntoView({"behavior": "auto", "block": "start", "inline": "nearest"})
          }

          if rect["bottom"] > innerHeight {
            listItem->scrollIntoView({"behavior": "auto", "block": "end", "inline": "nearest"})
          }
        })
      }

      None
    }, [isCurrentDocument])

    <>
      <div className=Style.List.container>
        <div className=Style.List.bullet> <Bullet /> </div>
        <div className={`${Style.List.item} ${focused}`} ref={ReactDOM.Ref.domRef(listItemRef)}>
          {switch (focus, mode, isCurrentDocument) {
          | (State.Note(State.DocumentPane()), State.Insert(_), true) => <NoteDocumentEditor />

          | _ => <NoteDocument document />
          }}
        </div>
        <div className=Style.List.child>
          {makeChildren(documentMap, document)
          ->Array.map((document: State.document) => {
            <DocumentsInner key=document.id document />
          })
          ->React.array}
        </div>
      </div>
    </>
  })
}

@react.component
let make = React.memo((~document: State.document) => {
  let documentMap = Redux.useSelector(State.Note.DocumentPane.documentMap)

  makeChildren(documentMap, document)
  ->Array.map((document: State.document) => <DocumentsInner key=document.id document />)
  ->React.array
})

React.setDisplayName(make, "Documents")
