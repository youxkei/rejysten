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

let makeChildren = (documentMap, document: State.noteDocument) => {
  let rec makeChildren = (documentId, children) => {
    switch documentMap->Map.String.get(documentId) {
    | Some(document: State.noteDocument) =>
      let _ = children->Js.Array2.push(document)
      makeChildren(document.nextId, children)

    | None => children
    }
  }

  makeChildren(document.firstChildId, [])
}

module rec DocumentsInner: {
  let make: {"document": State.noteDocument} => ReasonReact.reactElement
  let makeProps: (
    ~document: State.noteDocument,
    ~key: string=?,
    unit,
  ) => {"document": State.noteDocument}
} = {
  @react.component
  let make = React.memo((~document: State.noteDocument) => {
    let focus = Redux.useSelector(State.focus)
    let mode = Redux.useSelector(State.mode)
    let documentMap = Redux.useSelector(State.Firestore.documentMap)
    let selectedDocumentId = Redux.useSelector(State.Note.DocumentPane.selectedDocumentId)
    let listItemRef = React.useRef(Js.Nullable.null)
    let innerHeight = Hook.useInnerHeight()

    let isSelectedDocument = document.id == selectedDocumentId

    React.useEffect2(() => {
      if isSelectedDocument {
        listItemRef.current
        ->Js.Nullable.toOption
        ->Option.forEach(listItem => {
          let rect = listItem->getBoundingClientRect

          if rect["top"] < Style.globalMargin {
            listItem->scrollIntoView({"behavior": "auto", "block": "start", "inline": "nearest"})
          }

          if rect["bottom"] > innerHeight - Style.globalMargin {
            listItem->scrollIntoView({"behavior": "auto", "block": "end", "inline": "nearest"})
          }
        })
      }

      None
    }, (isSelectedDocument, innerHeight))

    <BulletList
      bullet={<Bullet />}
      item={switch (focus, mode, isSelectedDocument) {
      | (State.Note(State.DocumentPane()), State.Insert(_), true) => <Editor />

      | _ => <NoteDocument document />
      }}
      isSelectedItem=isSelectedDocument
      itemRef={ReactDOM.Ref.domRef(listItemRef)}
      child={makeChildren(documentMap, document)
      ->Array.map((document: State.noteDocument) => {
        <DocumentsInner key=document.id document />
      })
      ->React.array}
    />
  })
}

@react.component
let make = React.memo((~document: State.noteDocument) => {
  let documentMap = Redux.useSelector(State.Firestore.documentMap)

  makeChildren(documentMap, document)
  ->Array.map((document: State.noteDocument) => <DocumentsInner key=document.id document />)
  ->React.array
})

React.setDisplayName(make, "Documents")
