open Belt

@module("uuid") external uuidv4: unit => string = "v4"

type firestore_action =
  | SaveItem({text: string})
  | IndentItem({text: string})
  | UnindentItem({text: string})
  | AddItem({text: string})
  | DeleteItem

type cursor_position = Begin | End

type normal_mode_action =
  | ToInsertMode({initialCursorPosition: State.initial_cursor_position, itemId: option<string>})
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

let firestoreReducerMiddleware = (store, next, action) => {
  switch action {
  | Firestore(firestoreAction) =>
    switch firestoreAction {
    | SaveItem({text}) => {
        let {item: {currentId: currentItemId, map: itemMap}}: State.t = Reductive.Store.getState(
          store,
        )

        switch itemMap->HashMap.String.get(currentItemId) {
        | Some({id}) => {
            open Firebase.Firestore

            Firebase.firestore()->collection("items")->doc(id)->update({"text": text})
            Reductive.Store.dispatch(store, InsertMode(ToNormalMode))
          }
        | _ => ()
        }
      }

    | IndentItem({text}) => {
        let {item: {currentId: currentItemId, map: itemMap}}: State.t = Reductive.Store.getState(
          store,
        )

        switch itemMap->HashMap.String.get(currentItemId) {
        | Some({id, parentId, prevId, nextId}) =>
          switch itemMap->HashMap.String.get(prevId) {
          | Some({lastChildId: prevLastChildId}) => {
              open Firebase.Firestore

              let db = Firebase.firestore()
              let batch = db->batch
              let items = db->collection("items")

              if prevLastChildId == "" {
                batch->addUpdate(
                  items->doc(id),
                  {"parentId": prevId, "prevId": "", "nextId": "", "text": text},
                )
                batch->addUpdate(
                  items->doc(prevId),
                  {"nextId": nextId, "firstChildId": id, "lastChildId": id},
                )
              } else {
                batch->addUpdate(
                  items->doc(id),
                  {"parentId": prevId, "prevId": prevLastChildId, "nextId": "", "text": text},
                )
                batch->addUpdate(items->doc(prevId), {"nextId": nextId, "lastChildId": id})
                batch->addUpdate(items->doc(prevLastChildId), {"nextId": id})
              }

              if nextId == "" {
                if parentId != "" {
                  batch->addUpdate(items->doc(parentId), {"lastChildId": prevId})
                }
              } else {
                batch->addUpdate(items->doc(nextId), {"prevId": prevId})
              }

              batch->commit
            }

          | _ => ()
          }

        | _ => ()
        }
      }

    | UnindentItem({text}) => {
        let {item: {currentId: currentItemId, map: itemMap}}: State.t = Reductive.Store.getState(
          store,
        )

        switch itemMap->HashMap.String.get(currentItemId) {
        | Some({id, parentId, prevId, nextId}) =>
          switch itemMap->HashMap.String.get(parentId) {
          | Some({parentId: parentParentId, nextId: parentNextId}) =>
            if parentParentId != "" {
              open Firebase.Firestore

              let db = Firebase.firestore()
              let batch = db->batch
              let items = db->collection("items")

              batch->addUpdate(
                items->doc(id),
                {
                  "parentId": parentParentId,
                  "prevId": parentId,
                  "nextId": parentNextId,
                  "text": text,
                },
              )
              batch->addUpdate(items->doc(parentId), {"nextId": id})

              if nextId == "" {
                batch->addUpdate(items->doc(parentId), {"lastChildId": prevId})
              } else {
                batch->addUpdate(items->doc(nextId), {"prevId": prevId})
              }

              if prevId == "" {
                batch->addUpdate(items->doc(parentId), {"firstChildId": nextId})
              } else {
                batch->addUpdate(items->doc(prevId), {"nextId": nextId})
              }

              if parentNextId == "" {
                if parentParentId != "" {
                  batch->addUpdate(items->doc(parentParentId), {"lastChildId": id})
                }
              } else {
                batch->addUpdate(items->doc(parentNextId), {"prevId": id})
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
        | Some({id, parentId, nextId}) => {
            open Firebase.Firestore

            let db = Firebase.firestore()
            let batch = db->batch
            let items = db->collection("items")

            let addingItemId = uuidv4()

            batch->addUpdate(items->doc(id), {"nextId": addingItemId, "text": text})

            batch->addSet(
              items->doc(addingItemId),
              {
                "documentId": currentDocumentId,
                "text": "",
                "parentId": parentId,
                "prevId": id,
                "nextId": nextId,
                "firstChildId": "",
                "lastChildId": "",
              },
            )

            if nextId == "" {
              if parentId != "" {
                batch->addUpdate(items->doc(parentId), {"lastChildId": addingItemId})
              }
            } else {
              batch->addUpdate(items->doc(nextId), {"prevId": addingItemId})
            }

            batch->commit

            Reductive.Store.dispatch(store, SetCurrentItem({id: addingItemId}))
          }

        | _ => ()
        }
      }
    | DeleteItem => {
        let {item: {currentId: currentItemId, map: itemMap}}: State.t = Reductive.Store.getState(
          store,
        )

        switch itemMap->HashMap.String.get(currentItemId) {
        | Some({id, parentId, prevId, nextId}) => {
            open Firebase.Firestore

            let db = Firebase.firestore()
            let batch = db->batch
            let items = db->collection("items")

            batch->addDelete(items->doc(id))

            if prevId == "" {
              if parentId != "" {
                batch->addUpdate(items->doc(parentId), {"firstChildId": nextId})
              }
            } else {
              batch->addUpdate(items->doc(prevId), {"nextId": nextId})
            }

            if nextId == "" {
              if parentId != "" {
                batch->addUpdate(items->doc(parentId), {"lastChildId": prevId})
              }
            } else {
              batch->addUpdate(items->doc(nextId), {"prevId": prevId})
            }

            batch->commit

            if prevId == "" {
              if parentId != "" {
                Reductive.Store.dispatch(store, SetCurrentItem({id: parentId}))
              }
            } else {
              Reductive.Store.dispatch(store, SetCurrentItem({id: prevId}))
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
  | ToInsertMode({initialCursorPosition, itemId}) =>
    switch itemId {
    | Some(itemId) => {
        ...state,
        item: {
          ...state.item,
          currentId: itemId,
        },
        mode: State.Insert({initialCursorPosition: initialCursorPosition}),
      }

    | None => {
        ...state,
        mode: State.Insert({initialCursorPosition: initialCursorPosition}),
      }
    }

  | MoveCursorLeft => {
      let {
        document: {currentId: currentDocumentId, map: documentsMap},
        item: {currentId: currentItemId, map: itemsMap},
      } = state

      switch itemsMap->HashMap.String.get(currentItemId) {
      | Some({parentId}) if parentId != "" =>
        switch itemsMap->HashMap.String.get(parentId) {
        | Some({parentId: parentParentId}) if parentParentId != "" => {
            ...state,
            item: {
              ...state.item,
              currentId: parentId,
            },
          }

        | _ => state
        }

      | None =>
        switch documentsMap->HashMap.String.get(currentDocumentId) {
        | Some({rootItemId}) => switch itemsMap->HashMap.String.get(rootItemId) {
          | Some({firstChildId}) => {
              ...state,
              item: {
                ...state.item,
                currentId: firstChildId,
              },
            }

          | _ => state
          }

        | _ => state
        }

      | _ => state
      }
    }

  | MoveCursorDown => {
      let {
        document: {currentId: currentDocumentId, map: documentsMap},
        item: {currentId: currentItemId, map: itemsMap},
      } = state

      switch itemsMap->HashMap.String.get(currentItemId) {
      | Some({parentId, nextId, firstChildId}) =>
        switch (nextId, firstChildId) {
        | ("", "") =>
          switch itemsMap->HashMap.String.get(parentId) {
          | Some({nextId: parentNextId}) if parentNextId != "" => {
              ...state,
              item: {
                ...state.item,
                currentId: parentNextId,
              },
            }

          | _ => state
          }

        | (nextId, "") => {
            ...state,
            item: {
              ...state.item,
              currentId: nextId,
            },
          }

        | (_, firstChildId) => {
            ...state,
            item: {
              ...state.item,
              currentId: firstChildId,
            },
          }
        }

      | None =>
        switch documentsMap->HashMap.String.get(currentDocumentId) {
        | Some({rootItemId}) => switch itemsMap->HashMap.String.get(rootItemId) {
          | Some({firstChildId}) => {
              ...state,
              item: {
                ...state.item,
                currentId: firstChildId,
              },
            }

          | _ => state
          }

        | _ => state
        }
      }
    }

  | MoveCursorUp => {
      let {
        document: {currentId: currentDocumentId, map: documentsMap},
        item: {currentId: currentItemId, map: itemsMap},
      } = state

      switch itemsMap->HashMap.String.get(currentItemId) {
      | Some({prevId, parentId}) =>
        switch (prevId, parentId) {
        | ("", "") => state

        | ("", parentId) =>
          switch itemsMap->HashMap.String.get(parentId) {
          | Some({parentId: parentParentId}) if parentParentId != "" => {
              ...state,
              item: {
                ...state.item,
                currentId: parentId,
              },
            }

          | _ => state
          }

        | (prevId, _) =>
          switch itemsMap->HashMap.String.get(prevId) {
          | Some({lastChildId}) if lastChildId != "" => {
              ...state,
              item: {
                ...state.item,
                currentId: lastChildId,
              },
            }

          | _ => {
              ...state,
              item: {
                ...state.item,
                currentId: prevId,
              },
            }
          }
        }

      | None =>
        switch documentsMap->HashMap.String.get(currentDocumentId) {
        | Some({rootItemId}) => switch itemsMap->HashMap.String.get(rootItemId) {
          | Some({firstChildId}) => {
              ...state,
              item: {
                ...state.item,
                currentId: firstChildId,
              },
            }

          | _ => state
          }

        | _ => state
        }
      }
    }

  | MoveCursorRight => {
      let {
        document: {currentId: currentDocumentId, map: documentsMap},
        item: {currentId: currentItemId, map: itemsMap},
      } = state

      Js.log(currentItemId)

      switch itemsMap->HashMap.String.get(currentItemId) {
      | Some({firstChildId}) if firstChildId != "" => {
          ...state,
          item: {
            ...state.item,
            currentId: firstChildId,
          },
        }

      | None =>
        switch documentsMap->HashMap.String.get(currentDocumentId) {
        | Some({rootItemId}) => switch itemsMap->HashMap.String.get(rootItemId) {
          | Some({firstChildId}) => {
              ...state,
              item: {
                ...state.item,
                currentId: firstChildId,
              },
            }

          | _ => state
          }

        | _ => state
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
    | Insert(_) => insertModeReducer(state, insertModeAction)

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
