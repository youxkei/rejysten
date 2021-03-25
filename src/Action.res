open Belt

@module("uuid") external uuidv4: unit => string = "v4"

type firestore_action =
  | SaveItem({text: string})
  | IndentItem({text: string})
  | UnindentItem({text: string})
  | AddItem({text: string})
  | DeleteItem

type t =
  | Firestore(firestore_action)
  | EditingItem({id: string})
  | EditedItem
  | SyncItemsMap(Belt.HashMap.String.t<State.item>)
  | SyncDocumentsMap(Belt.HashMap.String.t<State.document>)

let firestoreReducer = (store, next, action) => {
  switch action {
  | Firestore(firestoreAction) =>
    switch firestoreAction {
    | SaveItem({text}) => {
        let {item: {current: currentItem, map: itemMap}}: State.t = Reductive.Store.getState(store)

        switch itemMap->HashMap.String.get(currentItem) {
        | Some(State.Item({id})) => {
            open Firebase.Firestore

            Firebase.firestore()->collection("items")->doc(id)->update({"text": text})
            Reductive.Store.dispatch(store, EditedItem)
          }
        | _ => ()
        }
      }

    | IndentItem({text}) => {
        let {item: {current: currentItem, map: itemMap}}: State.t = Reductive.Store.getState(store)

        switch itemMap->HashMap.String.get(currentItem) {
        | Some(State.Item({id, parent, prev, next})) =>
          switch itemMap->HashMap.String.get(prev) {
          | Some(State.Item({lastSubitem: prevLastSubitem})) => {
              open Firebase.Firestore

              let db = Firebase.firestore()
              let batch = db->batch
              let items = db->collection("items")

              if prevLastSubitem == "" {
                batch->addUpdate(
                  items->doc(id),
                  {"parent": prev, "prev": "", "next": "", "text": text},
                )
                batch->addUpdate(
                  items->doc(prev),
                  {"next": next, "firstSubitem": id, "lastSubitem": id},
                )
              } else {
                batch->addUpdate(
                  items->doc(id),
                  {"parent": prev, "prev": prevLastSubitem, "next": "", "text": text},
                )
                batch->addUpdate(items->doc(prev), {"next": next, "lastSubitem": id})
                batch->addUpdate(items->doc(prevLastSubitem), {"next": id})
              }

              if next == "" {
                if parent != "" {
                  batch->addUpdate(items->doc(parent), {"lastSubitem": prev})
                }
              } else {
                batch->addUpdate(items->doc(next), {"prev": prev})
              }

              batch->commit
            }

          | _ => ()
          }

        | _ => ()
        }
      }

    | UnindentItem({text}) => {
        let {item: {current: currentItem, map: itemMap}}: State.t = Reductive.Store.getState(store)

        switch itemMap->HashMap.String.get(currentItem) {
        | Some(State.Item({id, parent, prev, next})) =>
          switch itemMap->HashMap.String.get(parent) {
          | Some(State.Item({parent: parentParent, next: parentNext})) => {
              open Firebase.Firestore

              let db = Firebase.firestore()
              let batch = db->batch
              let items = db->collection("items")

              batch->addUpdate(
                items->doc(id),
                {"parent": parentParent, "prev": parent, "next": parentNext, "text": text},
              )
              batch->addUpdate(items->doc(parent), {"next": id})

              if next == "" {
                batch->addUpdate(items->doc(parent), {"lastSubitem": prev})
              } else {
                batch->addUpdate(items->doc(next), {"prev": prev})
              }

              if prev == "" {
                batch->addUpdate(items->doc(parent), {"firstSubitem": next})
              } else {
                batch->addUpdate(items->doc(prev), {"next": next})
              }

              if parentNext == "" {
                if parentParent != "" {
                  batch->addUpdate(items->doc(parentParent), {"lastSubitem": id})
                }
              } else {
                batch->addUpdate(items->doc(parentNext), {"prev": id})
              }

              batch->commit
            }

          | _ => ()
          }

        | _ => ()
        }
      }

    | AddItem({text}) => {
        let {
          item: {current: currentItem, map: itemMap},
          document: {current: currentDocument},
        }: State.t = Reductive.Store.getState(store)

        switch itemMap->HashMap.String.get(currentItem) {
        | Some(State.Item({id, parent, next})) => {
            open Firebase.Firestore

            let db = Firebase.firestore()
            let batch = db->batch
            let items = db->collection("items")

            let addingItemId = uuidv4()

            batch->addUpdate(items->doc(id), {"next": addingItemId, "text": text})

            batch->addSet(
              items->doc(addingItemId),
              {
                "document": currentDocument,
                "text": "",
                "parent": parent,
                "prev": id,
                "next": next,
                "firstSubitem": "",
                "lastSubitem": "",
              },
            )

            if next == "" {
              if parent != "" {
                batch->addUpdate(items->doc(parent), {"lastSubitem": addingItemId})
              }
            } else {
              batch->addUpdate(items->doc(next), {"prev": addingItemId})
            }

            batch->commit

            Reductive.Store.dispatch(store, EditingItem({id: addingItemId}))
          }

        | _ => ()
        }
      }
    | DeleteItem => {
        let {item: {current: currentItem, map: itemMap}}: State.t = Reductive.Store.getState(store)

        switch itemMap->HashMap.String.get(currentItem) {
        | Some(State.Item({id, parent, prev, next})) => {
            open Firebase.Firestore

            let db = Firebase.firestore()
            let batch = db->batch
            let items = db->collection("items")

            batch->addDelete(items->doc(id))

            if prev == "" {
              if parent != "" {
                batch->addUpdate(items->doc(parent), {"firstSubitem": next})
              }
            } else {
              batch->addUpdate(items->doc(prev), {"next": next})
            }

            if next == "" {
              if parent != "" {
                batch->addUpdate(items->doc(parent), {"lastSubitem": prev})
              }
            } else {
              batch->addUpdate(items->doc(next), {"prev": prev})
            }

            batch->commit

            if prev == "" {
              if parent != "" {
                Reductive.Store.dispatch(store, EditingItem({id: parent}))
              }
            } else {
              Reductive.Store.dispatch(store, EditingItem({id: prev}))
            }
          }

        | _ => ()
        }
      }
    }

  | _ => next(action)
  }
}

let reducer = (state: State.t, action) => {
  switch action {
  | EditingItem({id}) => {
      ...state,
      editing: true,
      item: {
        ...state.item,
        current: id,
      },
    }

  | EditedItem => {
      ...state,
      editing: false,
    }

  | Firestore(_) => state
  | SyncItemsMap(itemsMap) => {
      ...state,
      item: {
        ...state.item,
        map: itemsMap,
      },
    }
  | SyncDocumentsMap(documentsMap) => {
      ...state,
      document: {
        ...state.document,
        map: documentsMap,
      },
    }
  }
}
