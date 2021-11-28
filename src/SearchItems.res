open Belt

@val external window: Dom.window = "window"
@get
external outerHeight: Dom.window => float = "outerHeight"

%%private(
  let makeDocumentChildren = (documentMap, ancestorDocuments, document: State.noteDocument) => {
    let children = []

    let currentDocument = ref(documentMap->Map.String.get(document.firstChildId))

    while Belt.Option.isSome(currentDocument.contents) {
      let document: State.noteDocument = Option.getExn(currentDocument.contents)

      if ancestorDocuments->Set.String.has(document.id) {
        let _ = children->Js.Array2.push(document)
      }
      currentDocument := documentMap->Map.String.get(document.nextId)
    }

    children
  }

  let makeItemChildren = (itemMap, searchedItems, item: State.item) => {
    let children = []

    let currentItem = ref(itemMap->Map.String.get(item.firstChildId))

    while Option.isSome(currentItem.contents) {
      let item: State.item = Option.getExn(currentItem.contents)

      if searchedItems->Set.String.has(item.id) {
        let _ = children->Js.Array2.push(item)
      }
      currentItem := itemMap->Map.String.get(item.nextId)
    }

    children
  }
)

module rec ItemsInner: {
  let make: {"item": State.item} => ReasonReact.reactElement
  let makeProps: (~item: State.item, ~key: string=?, unit) => {"item": State.item}
} = {
  @react.component
  let make = (~item: State.item) => {
    let itemMap = Redux.useSelector(Selector.Firestore.itemMap)
    let searchedItems = Redux.useSelector(Selector.Search.searchedItems)

    <BulletList
      bullet={<Bullet />}
      item={<Item item />}
      child={makeItemChildren(itemMap, searchedItems, item)
      ->Array.map((item: State.item) => {
        <ItemsInner key=item.id item />
      })
      ->React.array}
    />
  }
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
  let make = (~document: State.noteDocument) => {
    let documentMap = Redux.useSelector(Selector.Firestore.documentMap)
    let itemMap = Redux.useSelector(Selector.Firestore.itemMap)
    let ancestorDocuments = Redux.useSelector(Selector.Search.ancestorDocuments)
    let searchedDocuments = Redux.useSelector(Selector.Search.searchedDocuments)
    let searchedItems = Redux.useSelector(Selector.Search.searchedItems)

    <BulletList
      bullet={<Bullet />}
      item={<NoteDocument document />}
      child={<>
        {if searchedDocuments->Set.String.has(document.id) {
          switch itemMap->Map.String.get(document.rootItemId) {
          | Some(rootItem) =>
            makeItemChildren(itemMap, searchedItems, rootItem)
            ->Array.map((item: State.item) => {
              <RenderIfVisible key=item.id defaultHeight={window->outerHeight}>
                <ItemsInner key=item.id item />
              </RenderIfVisible>
            })
            ->React.array

          | None => React.null
          }
        } else {
          React.null
        }}
        {makeDocumentChildren(documentMap, ancestorDocuments, document)
        ->Array.map((document: State.noteDocument) => {
          <DocumentsInner key=document.id document />
        })
        ->React.array}
      </>}
    />
  }
}

@react.component
let make = () => {
  let documentMap = Redux.useSelector(Selector.Firestore.documentMap)
  let rootDocument = Redux.useSelector(Selector.Firestore.rootDocument)
  let ancestorDocuments = Redux.useSelector(Selector.Search.ancestorDocuments)
  let searchedItems = Redux.useSelector(Selector.Search.searchedItems)

  switch rootDocument {
  | Some(rootDocument) =>
    if searchedItems->Set.String.size == 0 {
      <p> {React.string("Not Available")} </p>
    } else {
      makeDocumentChildren(documentMap, ancestorDocuments, rootDocument)
      ->Array.map((document: State.noteDocument) => <DocumentsInner key={document.id} document />)
      ->React.array
    }

  | None => React.null
  }
}
