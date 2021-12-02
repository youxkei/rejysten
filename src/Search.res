open Belt

module Sync = {
  let rec addItemAncestors = (set, itemMap, item: State.Item.t) => {
    switch itemMap->Map.String.get(item.parentId) {
    | Some(parent) => set->Set.String.add(item.id)->addItemAncestors(itemMap, parent)
    | None => set->Set.String.add(item.id)
    }
  }

  let rec addDocumentAncestors = (set, documentMap, document: State.noteDocument) => {
    switch documentMap->Map.String.get(document.parentId) {
    | Some(parent) => set->Set.String.add(document.id)->addDocumentAncestors(documentMap, parent)
    | None => set->Set.String.add(document.id)
    }
  }

  let search = (documentMap, itemMap, searchingText) => {
    if searchingText == "" {
      (Set.String.empty, Set.String.empty, Set.String.empty)
    } else {
      let (documentSet, itemSet) = itemMap->Map.String.reduce(
        (Set.String.empty, Set.String.empty),
        ((documentSet, itemSet), _, item: State.Item.t) => {
          switch item.container {
          | State.Item.Note({documentId}) =>
            if item.text->Js.String2.includes(searchingText) {
              (documentSet->Set.String.add(documentId), itemSet->addItemAncestors(itemMap, item))
            } else {
              (documentSet, itemSet)
            }

          | _ => (documentSet, itemSet)
          }
        },
      )

      let ancestorDocumentSet = documentMap->Map.String.reduce(Set.String.empty, (
        set,
        _,
        document: State.noteDocument,
      ) => {
        if documentSet->Set.String.has(document.id) {
          set->addDocumentAncestors(documentMap, document)
        } else {
          set
        }
      })

      (ancestorDocumentSet, documentSet, itemSet)
    }
  }

  @react.component
  let make = () => {
    let dispatch = Redux.useDispatch()
    let documentMap = Redux.useSelector(Selector.Firestore.documentMap)
    let itemMap = Redux.useSelector(Selector.Firestore.itemMap)
    let searchingText = Redux.useSelector(Selector.Search.searchingText)
    let (searchingText, ()) = Hook.useDebounce(searchingText, 200)

    React.useEffect2(() => {
      let (ancestorDocuments, searchedDocuments, searchedItems) = search(
        documentMap,
        itemMap,
        searchingText,
      )

      dispatch(
        Action.SetSearchState({
          ancestorDocuments: ancestorDocuments,
          searchedDocuments: searchedDocuments,
          searchedItems: searchedItems,
        }),
      )

      None
    }, (itemMap, searchingText))

    React.null
  }
}

@react.component
let make = () => {
  <> <SearchEditor /> <SearchItems /> <Sync /> </>
}
