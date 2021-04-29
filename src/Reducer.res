open Belt

let get = HashMap.String.get

exception ActionShouldBeProcessedByMiddleware(Action.t)

let documentItemsReducer = (state: State.t, action) => {
  switch action {
  | Action.ToAboveItem() =>
    switch state->State.DocumentItem.current {
    | Some(item) =>
      switch state->State.DocumentItem.above(item) {
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
      switch state->State.Document.current {
      | Some({rootItemId}) =>
        switch state->State.DocumentItem.get(rootItemId) {
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
    switch state->State.DocumentItem.current {
    | Some(item) =>
      switch state->State.DocumentItem.below(item) {
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
      switch state->State.Document.current {
      | Some({rootItemId}) =>
        switch state->State.DocumentItem.get(rootItemId) {
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
    let editingText = switch state->State.DocumentItem.current {
    | Some({text}) => text

    | None => ""
    }

    {
      ...state,
      documentItems: {
        ...state.documentItems,
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
    switch state->State.Document.current {
    | Some(currentDocument) =>
      switch state->State.Document.above(currentDocument) {
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
    switch state->State.Document.current {
    | Some(currentDocument) =>
      switch state->State.Document.below(currentDocument) {
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
    if state.documentItems.currentId == "" {
      switch state->State.Document.current {
      | Some({rootItemId}) =>
        switch state->State.DocumentItem.get(rootItemId) {
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
