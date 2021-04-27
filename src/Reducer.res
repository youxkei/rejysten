open Belt

let get = HashMap.String.get

exception ActionShouldBeProcessedByMiddleware(Action.t)

let documentItemsReducer = (state: State.t, action) => {
  switch action {
  | Action.ToAboveItem() =>
    let {
      documents: {currentId: currentDocumentId, map: documentMap},
      documentItems: {currentId: currentDocumentItemId, map: documentItemMap},
    } = state

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
        switch documentItemMap->State.Item.get(rootItemId) {
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

  | Action.ToBelowItem() =>
    let {
      documents: {currentId: currentDocumentId, map: documentMap},
      documentItems: {currentId: currentDocumentItemId, map: documentItemMap},
    } = state

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
        switch documentItemMap->State.Item.get(rootItemId) {
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

  | Action.ToDocuments() => {
      ...state,
      focus: State.Documents,
    }

  | ToInsertMode({initialCursorPosition}) =>
    let {documentItems: {map, currentId}} = state

    let editingText = switch map->State.Item.get(currentId) {
    | Some({text}) => text

    | None => ""
    }

    {
      ...state,
      documentItems: {
        ...state.documentItems,
        currentId: currentId,
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
    }

  | Action.SetEditingText({text}) => {
      ...state,
      documentItems: {
        ...state.documentItems,
        editingText: text,
      },
    }

  | Action.SetCurrentItem({id, initialCursorPosition}) =>
    switch state.mode {
    | State.Normal => {
        ...state,
        documentItems: {
          ...state.documentItems,
          currentId: id,
        },
      }

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
    }
  }
}

let documentsReducer = (state: State.t, action) => {
  switch action {
  | Action.ToAboveDocument() =>
    let {documents: {currentId, map}} = state

    switch map->State.Document.get(currentId) {
    | Some(currentDocument) =>
      switch currentDocument->State.Document.above(map) {
      | Some({id: aboveId, parentId: aboveParentId}) if aboveParentId != "" => {
          ...state,
          documents: {
            ...state.documents,
            currentId: aboveId,
          },
          documentItems: {
            ...state.documentItems,
            currentId: "",
          },
        }

      | _ => state
      }

    | None => state
    }

  | Action.ToBelowDocument() =>
    let {documents: {currentId, map}} = state

    switch map->State.Document.get(currentId) {
    | Some(currentDocument) =>
      switch currentDocument->State.Document.below(map) {
      | Some({id: belowId}) => {
          ...state,
          documents: {
            ...state.documents,
            currentId: belowId,
          },
          documentItems: {
            ...state.documentItems,
            currentId: "",
          },
        }

      | None => state
      }

    | None => state
    }

  | Action.ToDocumentItems() =>
    let {
      documents: {currentId, map},
      documentItems: {currentId: currentDocumentItemId, map: documentItemMap},
    } = state

    if currentDocumentItemId == "" {
      switch map->State.Document.get(currentId) {
      | Some({rootItemId}) =>
        switch documentItemMap->State.Item.get(rootItemId) {
        | Some({firstChildId}) => {
            ...state,
            focus: State.DocumentItems,
            documents: {
              ...state.documents,
              editingText: "",
            },
            documentItems: {
              ...state.documentItems,
              currentId: firstChildId,
            },
          }

        | None => state
        }

      | None => state
      }
    } else {
      {
        ...state,
        focus: State.DocumentItems,
        documents: {
          ...state.documents,
          editingText: "",
        },
      }
    }
  }
}

let reducer = (state: State.t, action) => {
  switch action {
  | Action.KeyDown(_)
  | Action.FirestoreDocumentItems(_)
  | Action.FirestoreDocuments(_) =>
    raise(ActionShouldBeProcessedByMiddleware(action))

  | Action.DocumentItems(action) => documentItemsReducer(state, action)
  | Action.Documents(action) => documentsReducer(state, action)

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
