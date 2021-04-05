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
  | ToInsertMode({initialCursorPosition: State.initialCursorPosition, itemId: option<string>})
  | MoveCursorLeft
  | MoveCursorDown
  | MoveCursorUp
  | MoveCursorRight

type insert_mode_action = ToNormalMode

type t =
  | Firestore(firestore_action)
  | NormalMode(normal_mode_action)
  | InsertMode(insert_mode_action)
  | SetCurrentDocumentItem({id: string})
  | SetDocumentItemState({map: HashMap.String.t<State.item>})
  | SetDocumentState({map: HashMap.String.t<State.document>, rootId: string})

let firestoreReducerMiddleware = (store, next, action) => {
  switch action {
  | Firestore(firestoreAction) =>
    switch firestoreAction {
    | SaveItem({text}) => {
        let {
          documentItem: {currentId: currentDocumentItemId, map: documentItemMap},
        }: State.t = Reductive.Store.getState(store)

        switch documentItemMap->HashMap.String.get(currentDocumentItemId) {
        | Some({id}) => {
            open Firebase.Firestore

            Firebase.firestore()->collection("items")->doc(id)->update({"text": text})
            Reductive.Store.dispatch(store, InsertMode(ToNormalMode))
          }
        | _ => ()
        }
      }

    | IndentItem({text}) => {
        let {
          documentItem: {currentId: currentDocumentItemId, map: documentItemMap},
        }: State.t = Reductive.Store.getState(store)

        switch documentItemMap->HashMap.String.get(currentDocumentItemId) {
        | Some({id, parentId, prevId, nextId}) =>
          switch documentItemMap->HashMap.String.get(prevId) {
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
        let {
          documentItem: {currentId: currentDocumentItemId, map: documentItemMap},
        }: State.t = Reductive.Store.getState(store)

        switch documentItemMap->HashMap.String.get(currentDocumentItemId) {
        | Some({id, parentId, prevId, nextId}) =>
          switch documentItemMap->HashMap.String.get(parentId) {
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
          documentItem: {currentId: currentDocumentItemId, map: documentItemMap},
          document: {currentId: currentDocumentId},
        }: State.t = Reductive.Store.getState(store)

        switch documentItemMap->HashMap.String.get(currentDocumentItemId) {
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

            Reductive.Store.dispatch(store, SetCurrentDocumentItem({id: addingItemId}))
          }

        | _ => ()
        }
      }
    | DeleteItem => {
        let {
          documentItem: {currentId: currentDocumentItemId, map: documentItemMap},
        }: State.t = Reductive.Store.getState(store)

        switch documentItemMap->HashMap.String.get(currentDocumentItemId) {
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
                Reductive.Store.dispatch(store, SetCurrentDocumentItem({id: parentId}))
              }
            } else {
              Reductive.Store.dispatch(store, SetCurrentDocumentItem({id: prevId}))
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
        documentItem: {
          ...state.documentItem,
          currentId: itemId,
        },
        mode: State.Insert({initialCursorPosition: initialCursorPosition}),
      }

    | None => {
        ...state,
        mode: State.Insert({initialCursorPosition: initialCursorPosition}),
      }
    }

  | MoveCursorLeft =>
    switch state.focus {
    | State.Documents => state

    | State.DocumentItems => {
        let {
          document: {map: documentMap, currentId: currentDocumentId, rootId: rootDocumentId},
        } = state

        if currentDocumentId == "" {
          switch documentMap->HashMap.String.get(rootDocumentId) {
          | Some(document) => if document.firstChildId == "" {
              state
            } else {
              {
                ...state,
                document: {
                  ...state.document,
                  currentId: document.firstChildId,
                },
              }
            }

          | None => state
          }
        } else {
          {
            ...state,
            focus: State.Documents,
          }
        }
      }
    }

  | MoveCursorDown => {
      let {
        document: {currentId: currentDocumentId, map: documentMap},
        documentItem: {currentId: currentDocumentItemId, map: documentItemMap},
      } = state

      switch documentItemMap->HashMap.String.get(currentDocumentItemId) {
      | Some({parentId, nextId, firstChildId}) =>
        switch (nextId, firstChildId) {
        | ("", "") =>
          switch documentItemMap->HashMap.String.get(parentId) {
          | Some({nextId: parentNextId}) if parentNextId != "" => {
              ...state,
              documentItem: {
                ...state.documentItem,
                currentId: parentNextId,
              },
            }

          | _ => state
          }

        | (nextId, "") => {
            ...state,
            documentItem: {
              ...state.documentItem,
              currentId: nextId,
            },
          }

        | (_, firstChildId) => {
            ...state,
            documentItem: {
              ...state.documentItem,
              currentId: firstChildId,
            },
          }
        }

      | None =>
        switch documentMap->HashMap.String.get(currentDocumentId) {
        | Some({rootItemId}) =>
          switch documentItemMap->HashMap.String.get(rootItemId) {
          | Some({firstChildId}) => {
              ...state,
              documentItem: {
                ...state.documentItem,
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
        document: {currentId: currentDocumentId, map: documentMap},
        documentItem: {currentId: currentDocumentItemId, map: documentItemMap},
      } = state

      switch documentItemMap->HashMap.String.get(currentDocumentItemId) {
      | Some({prevId, parentId}) =>
        switch (prevId, parentId) {
        | ("", "") => state

        | ("", parentId) =>
          switch documentItemMap->HashMap.String.get(parentId) {
          | Some({parentId: parentParentId}) if parentParentId != "" => {
              ...state,
              documentItem: {
                ...state.documentItem,
                currentId: parentId,
              },
            }

          | _ => state
          }

        | (prevId, _) =>
          switch documentItemMap->HashMap.String.get(prevId) {
          | Some({lastChildId}) if lastChildId != "" => {
              ...state,
              documentItem: {
                ...state.documentItem,
                currentId: lastChildId,
              },
            }

          | _ => {
              ...state,
              documentItem: {
                ...state.documentItem,
                currentId: prevId,
              },
            }
          }
        }

      | None =>
        switch documentMap->HashMap.String.get(currentDocumentId) {
        | Some({rootItemId}) =>
          switch documentItemMap->HashMap.String.get(rootItemId) {
          | Some({firstChildId}) => {
              ...state,
              documentItem: {
                ...state.documentItem,
                currentId: firstChildId,
              },
            }

          | _ => state
          }

        | _ => state
        }
      }
    }

  | MoveCursorRight =>
    switch state.focus {
    | State.Documents => {
        let {
          document: {map: documentMap, currentId: currentDocumentId},
          documentItem: {map: documentItemMap, currentId: currentDocumentItemId},
        } = state

        if currentDocumentItemId == "" {
          switch documentMap->HashMap.String.get(currentDocumentId) {
          | Some(document) =>
            if document.rootItemId == "" {
              state
            } else {
              switch documentItemMap->HashMap.String.get(document.rootItemId) {
              | Some(item) =>
                if item.firstChildId == "" {
                  state
                } else {
                  {
                    ...state,
                    focus: State.DocumentItems,
                    documentItem: {
                      ...state.documentItem,
                      currentId: item.firstChildId,
                    },
                  }
                }

              | None => state
              }
            }

          | None => state
          }
        } else {
          {
            ...state,
            focus: State.DocumentItems,
          }
        }
      }

    | State.DocumentItems => state
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

  | SetCurrentDocumentItem({id}) => {
      ...state,
      documentItem: {
        ...state.documentItem,
        currentId: id,
      },
    }

  | SetDocumentItemState({map}) => {
      ...state,
      documentItem: {
        ...state.documentItem,
        map: map,
      },
    }

  | SetDocumentState({map, rootId}) => {
      ...state,
      document: {
        ...state.document,
        map: map,
        rootId: rootId,
      },
    }
  }
}
