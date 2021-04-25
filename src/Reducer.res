open Belt

let get = HashMap.String.get

exception ActionShouldBeProcessedByMiddleware(Action.t)

let reducer = (state: State.t, action) => {
  switch action {
  | Action.KeyDown(_)
  | Action.FirestoreItem(_)
  | Action.FirestoreDocument(_) => {
      raise(ActionShouldBeProcessedByMiddleware(action))
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
        focus,
        documents: {currentId: currentDocumentId, map: documentMap},
        documentItems: {currentId: currentDocumentItemId, map: documentItemMap},
      } = state

      switch focus {
      | State.Documents =>
        switch documentMap->HashMap.String.get(currentDocumentId) {
        | Some({parentId, nextId, firstChildId}) =>
          switch (nextId, firstChildId) {
          | ("", "") =>
            switch documentMap->HashMap.String.get(parentId) {
            | Some({nextId: parentNextId}) if parentNextId != "" => {
                ...state,
                documents: {
                  ...state.documents,
                  currentId: parentNextId,
                },
                documentItems: {
                  ...state.documentItems,
                  currentId: "",
                },
              }

            | _ => state
            }

          | (nextId, "") => {
              ...state,
              documents: {
                ...state.documents,
                currentId: nextId,
              },
              documentItems: {
                ...state.documentItems,
                currentId: "",
              },
            }

          | (_, firstChildId) => {
              ...state,
              documents: {
                ...state.documents,
                currentId: firstChildId,
              },
              documentItems: {
                ...state.documentItems,
                currentId: "",
              },
            }
          }

        | None => state
        }

      | State.DocumentItems =>
        switch documentItemMap->State.Item.get(currentDocumentItemId) {
        | Some(item) =>
          switch item->State.Item.below(documentItemMap) {
          | Some({id: belowId}) => {
              ...state,
              documentItems: {
                ...state.documentItems,
                currentId: belowId,
              },
            }

          | _ => state
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
    }

  | Action.MoveCursorUp() => {
      let {
        focus,
        documents: {currentId: currentDocumentId, map: documentMap},
        documentItems: {currentId: currentDocumentItemId, map: documentItemMap},
      } = state

      switch focus {
      | State.Documents =>
        switch documentMap->HashMap.String.get(currentDocumentId) {
        | Some({prevId, parentId}) =>
          switch (prevId, parentId) {
          | ("", "") => state

          | ("", parentId) =>
            switch documentMap->HashMap.String.get(parentId) {
            | Some({parentId: parentParentId}) if parentParentId != "" => {
                ...state,
                documents: {
                  ...state.documents,
                  currentId: parentId,
                },
                documentItems: {
                  ...state.documentItems,
                  currentId: "",
                },
              }

            | _ => state
            }

          | (prevId, _) =>
            switch documentMap->HashMap.String.get(prevId) {
            | Some({lastChildId: prevLastChildId}) if prevLastChildId != "" => {
                ...state,
                documents: {
                  ...state.documents,
                  currentId: prevLastChildId,
                },
                documentItems: {
                  ...state.documentItems,
                  currentId: "",
                },
              }

            | _ => {
                ...state,
                documents: {
                  ...state.documents,
                  currentId: prevId,
                },
                documentItems: {
                  ...state.documentItems,
                  currentId: "",
                },
              }
            }
          }

        | None => state
        }

      | State.DocumentItems =>
        switch documentItemMap->State.Item.get(currentDocumentItemId) {
        | Some(item) =>
          switch item->State.Item.above(documentItemMap) {
          | Some({id: aboveId, parentId: aboveParentId}) if aboveParentId != "" => {
              ...state,
              documentItems: {
                ...state.documentItems,
                currentId: aboveId,
              },
            }

          | _ => state
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

            | None => state
            }

          | None => state
          }
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
    let {documentItems: {map: documentItemMap, currentId: currentDocumentItemId}} = state

    let itemId = switch itemId {
    | Some(itemId) => itemId

    | None => currentDocumentItemId
    }

    let editingText = switch documentItemMap->get(itemId) {
    | Some({text}) => text

    | None => ""
    }

    {
      ...state,
      documentItems: {
        ...state.documentItems,
        currentId: itemId,
        editingText: editingText,
      },
      mode: State.Insert({initialCursorPosition: initialCursorPosition}),
    }

  | Action.ToNormalMode() => {
      ...state,
      mode: State.Normal,
      documentItems: {
        ...state.documentItems,
        editingText: "",
      },
      documents: {
        ...state.documents,
        editingText: "",
      },
    }

  | Action.SetDocumentEditingText({text}) => {
      ...state,
      documents: {
        ...state.documents,
        editingText: text,
      },
    }

  | Action.SetDocumentItemEditingText({text}) => {
      ...state,
      documentItems: {
        ...state.documentItems,
        editingText: text,
      },
    }

  | Action.SetCurrentDocumentItem({id, initialCursorPosition}) =>
    switch state.mode {
    | State.Insert(_) => {
        let {documentItems: {map: documentItemMap}} = state

        let editingText = switch documentItemMap->get(id) {
        | Some({text}) => text

        | None => ""
        }

        {
          ...state,
          mode: State.Insert({initialCursorPosition: initialCursorPosition}),
          documentItems: {
            ...state.documentItems,
            currentId: id,
            editingText: editingText,
          },
        }
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
