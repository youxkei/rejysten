open Belt

@module("uuid") external uuidv4: unit => string = "v4"

type firestore_action =
  | SaveItem({text: string})
  | IndentItem({text: string})
  | UnindentItem({text: string})
  | AddItem({text: string})
  | DeleteItem

type normal_mode_action =
  | ToInsertMode({item_id: option<string>})
  | MoveCursorLeft
  | MoveCursorDown
  | MoveCursorUp
  | MoveCursorRight

type insert_mode_action = ToNormalMode

type t =
  | Firestore(firestore_action)
  | NormalMode(normal_mode_action)
  | InsertMode(insert_mode_action)
  | SetCurrentItem({id: string})
  | SetItemsMap(Belt.HashMap.String.t<State.item>)
  | SetDocumentsMap(Belt.HashMap.String.t<State.document>)

let firestoreReducer = (store, next, action) => {
  switch action {
  | Firestore(firestoreAction) =>
    switch firestoreAction {
    | SaveItem({text}) => {
        let {item: {currentId: currentItemId, map: itemMap}}: State.t = Reductive.Store.getState(store)

        switch itemMap->HashMap.String.get(currentItemId) {
        | Some(State.Item({id})) => {
            open Firebase.Firestore

            Firebase.firestore()->collection("items")->doc(id)->update({"text": text})
            Reductive.Store.dispatch(store, InsertMode(ToNormalMode))
          }
        | _ => ()
        }
      }

    | IndentItem({text}) => {
        let {item: {currentId: currentItemId, map: itemMap}}: State.t = Reductive.Store.getState(store)

        switch itemMap->HashMap.String.get(currentItemId) {
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
        let {item: {currentId: currentItemId, map: itemMap}}: State.t = Reductive.Store.getState(store)

        switch itemMap->HashMap.String.get(currentItemId) {
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
          item: {currentId: currentItemId, map: itemMap},
          document: {currentId: currentDocumentId},
        }: State.t = Reductive.Store.getState(store)

        switch itemMap->HashMap.String.get(currentItemId) {
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
                "document": currentDocumentId,
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

            Reductive.Store.dispatch(store, SetCurrentItem({id: addingItemId}))
          }

        | _ => ()
        }
      }
    | DeleteItem => {
        let {item: {currentId: currentItemId, map: itemMap}}: State.t = Reductive.Store.getState(store)

        switch itemMap->HashMap.String.get(currentItemId) {
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
                Reductive.Store.dispatch(store, SetCurrentItem({id: parent}))
              }
            } else {
              Reductive.Store.dispatch(store, SetCurrentItem({id: prev}))
            }
          }

        | _ => ()
        }
      }
    }

  | _ => next(action)
  }
}

let normalModeReducer = (state: State.t, action) => {
  switch action {
  | ToInsertMode({item_id}) =>
    switch item_id {
    | Some(item_id) => {
        ...state,
        item: {
          ...state.item,
          currentId: item_id,
        },
        mode: State.Insert,
      }

    | None => {
        ...state,
        mode: State.Insert,
      }
    }

  | MoveCursorLeft => {
      let {item: {currentId: currentItemId, map: itemsMap}} = state

      switch itemsMap->HashMap.String.get(currentItemId) {
      | Some(State.Item({parent})) if parent != "" =>
        switch itemsMap->HashMap.String.get(parent) {
        | Some(State.Item({parent: parentParent})) if parentParent != "" => {
            ...state,
            item: {
              ...state.item,
              currentId: parent,
            },
          }

        | _ => state
        }

      | _ => state
      }
    }

  | MoveCursorDown => {
      let {item: {currentId: currentItemId, map: itemsMap}} = state

      switch itemsMap->HashMap.String.get(currentItemId) {
      | Some(State.Item({parent, next, firstSubitem})) =>
        switch (next, firstSubitem) {
        | ("", "") =>
          switch itemsMap->HashMap.String.get(parent) {
          | Some(State.Item({next: parentNext})) if parentNext != "" => {
              ...state,
              item: {
                ...state.item,
                currentId: parentNext,
              },
            }

          | _ => state
          }

        | (next, "") => {
            ...state,
            item: {
              ...state.item,
              currentId: next,
            },
          }

        | (_, firstSubitem) => {
            ...state,
            item: {
              ...state.item,
              currentId: firstSubitem,
            },
          }
        }

      | _ => state
      }
    }

  | MoveCursorUp => {
      let {item: {currentId: currentItemId, map: itemsMap}} = state

      switch itemsMap->HashMap.String.get(currentItemId) {
      | Some(State.Item({prev, parent})) =>
        switch (prev, parent) {
        | ("", "") => state

        | ("", parent) =>
          switch itemsMap->HashMap.String.get(parent) {
          | Some(State.Item({parent: parentParent})) if parentParent != "" => {
              ...state,
              item: {
                ...state.item,
                currentId: parent,
              },
            }

          | _ => state
          }

        | (prev, _) => switch itemsMap->HashMap.String.get(prev) {
          | Some(State.Item({lastSubitem})) if lastSubitem != "" => {
              ...state,
              item: {
                ...state.item,
                currentId: lastSubitem,
              },
            }

          | _ => {
              ...state,
              item: {
                ...state.item,
                currentId: prev,
              },
            }
          }
        }
      | _ => state
      }
    }

  | MoveCursorRight => {
      let {item: {currentId: currentItemId, map: itemsMap}} = state

      switch itemsMap->HashMap.String.get(currentItemId) {
      | Some(State.Item({firstSubitem})) if firstSubitem != "" => {
          ...state,
          item: {
            ...state.item,
            currentId: firstSubitem,
          },
        }

      | _ => state
      }
    }
  }
}

let insertModeReducer = (state: State.t, action) => {
  switch action {
  | ToNormalMode => {
      ...state,
      mode: Normal,
    }
  }
}

let reducer = (state: State.t, action) => {
  switch action {
  | Firestore(_) => state

  | NormalMode(normalModeAction) =>
    switch state.mode {
    | Normal => normalModeReducer(state, normalModeAction)

    | _ => state
    }

  | InsertMode(insertModeAction) =>
    switch state.mode {
    | Insert => insertModeReducer(state, insertModeAction)

    | _ => state
    }

  | SetCurrentItem({id}) => {
      ...state,
      item: {
        ...state.item,
        currentId: id,
      },
    }

  | SetItemsMap(itemsMap) => {
      ...state,
      item: {
        ...state.item,
        map: itemsMap,
      },
    }

  | SetDocumentsMap(documentsMap) => {
      ...state,
      document: {
        ...state.document,
        map: documentsMap,
      },
    }
  }
}
