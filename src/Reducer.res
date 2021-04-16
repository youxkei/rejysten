open Belt

let reducer = (state: State.t, action) => {
  switch action {
  | Action.FirestoreItem(_)
  | Action.FirestoreDocument(_) => {
      Js.log(j`$action should be processed by middleware`)
      state
    }

  | Action.MoveCursorLeft() =>
    switch state.focus {
    | State.Documents => state

    | State.DocumentItems => {
        let {
          documents: {map: documentMap, currentId: currentDocumentId, rootId: rootDocumentId},
        } = state

        if currentDocumentId == "" {
          switch documentMap->HashMap.String.get(rootDocumentId) {
          | Some(documents) =>
            if documents.firstChildId == "" {
              state
            } else {
              {
                ...state,
                documents: {
                  ...state.documents,
                  currentId: documents.firstChildId,
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

  | Action.MoveCursorDown() => {
      let {
        documents: {currentId: currentDocumentId, map: documentMap},
        documentItems: {currentId: currentDocumentItemId, map: documentItemMap},
      } = state

      switch documentItemMap->HashMap.String.get(currentDocumentItemId) {
      | Some({parentId, nextId, firstChildId}) =>
        switch (nextId, firstChildId) {
        | ("", "") =>
          switch documentItemMap->HashMap.String.get(parentId) {
          | Some({nextId: parentNextId}) if parentNextId != "" => {
              ...state,
              documentItems: {
                ...state.documentItems,
                currentId: parentNextId,
              },
            }

          | _ => state
          }

        | (nextId, "") => {
            ...state,
            documentItems: {
              ...state.documentItems,
              currentId: nextId,
            },
          }

        | (_, firstChildId) => {
            ...state,
            documentItems: {
              ...state.documentItems,
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
              documentItems: {
                ...state.documentItems,
                currentId: firstChildId,
              },
            }

          | _ => state
          }

        | _ => state
        }
      }
    }

  | Action.MoveCursorUp() => {
      let {
        documents: {currentId: currentDocumentId, map: documentMap},
        documentItems: {currentId: currentDocumentItemId, map: documentItemMap},
      } = state

      switch documentItemMap->HashMap.String.get(currentDocumentItemId) {
      | Some({prevId, parentId}) =>
        switch (prevId, parentId) {
        | ("", "") => state

        | ("", parentId) =>
          switch documentItemMap->HashMap.String.get(parentId) {
          | Some({parentId: parentParentId}) if parentParentId != "" => {
              ...state,
              documentItems: {
                ...state.documentItems,
                currentId: parentId,
              },
            }

          | _ => state
          }

        | (prevId, _) =>
          switch documentItemMap->HashMap.String.get(prevId) {
          | Some({lastChildId}) if lastChildId != "" => {
              ...state,
              documentItems: {
                ...state.documentItems,
                currentId: lastChildId,
              },
            }

          | _ => {
              ...state,
              documentItems: {
                ...state.documentItems,
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
              documentItems: {
                ...state.documentItems,
                currentId: firstChildId,
              },
            }

          | _ => state
          }

        | _ => state
        }
      }
    }

  | Action.MoveCursorRight() =>
    switch state.focus {
    | State.Documents => {
        let {
          documents: {map: documentMap, currentId: currentDocumentId},
          documentItems: {map: documentItemMap, currentId: currentDocumentItemId},
        } = state

        if currentDocumentItemId == "" {
          switch documentMap->HashMap.String.get(currentDocumentId) {
          | Some(documents) =>
            if documents.rootItemId == "" {
              state
            } else {
              switch documentItemMap->HashMap.String.get(documents.rootItemId) {
              | Some(item) =>
                if item.firstChildId == "" {
                  state
                } else {
                  {
                    ...state,
                    focus: State.DocumentItems,
                    documentItems: {
                      ...state.documentItems,
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

  | Action.ToInsertMode({initialCursorPosition, itemId}) =>
    switch itemId {
    | Some(itemId) => {
        ...state,
        documentItems: {
          ...state.documentItems,
          currentId: itemId,
        },
        mode: State.Insert({initialCursorPosition: initialCursorPosition}),
      }

    | None => {
        ...state,
        mode: State.Insert({initialCursorPosition: initialCursorPosition}),
      }
    }

  | Action.ToNormalMode() => {
      ...state,
      mode: State.Normal,
    }

  | Action.SetCurrentDocumentItem({id, initialCursorPosition}) =>
    switch state.mode {
    | State.Insert(_) => {
        ...state,
        mode: State.Insert({initialCursorPosition: initialCursorPosition}),
        documentItems: {
          ...state.documentItems,
          currentId: id,
        },
      }

    | _ => {
        ...state,
        documentItems: {
          ...state.documentItems,
          currentId: id,
        },
      }
    }

  | Action.SetDocumentItemState({map}) => {
      ...state,
      documentItems: {
        ...state.documentItems,
        map: map,
      },
    }

  | Action.SetDocumentState({map, rootId}) => {
      ...state,
      documents: {
        ...state.documents,
        map: map,
        rootId: rootId,
      },
    }

  | Action.DevToolUpdate({state}) => state
  }
}
