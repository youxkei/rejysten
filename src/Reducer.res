open Belt

let get = HashMap.String.get

exception ActionShouldBeProcessedByMiddleware(Action.t)

let documentPaneReducer = (state: State.t, action) => {
  switch action {
  | Action.ToAboveDocument() =>
    switch state->State.DocumentPane.currentDocument {
    | Some(currentDocument) =>
      switch state->State.DocumentPane.aboveDocument(currentDocument) {
      | Some({id: aboveId, parentId: aboveParentId}) if aboveParentId != "" => {
          ...state,
          documentPane: {
            ...state.documentPane,
            currentId: aboveId,
          },
          documentItemPane: {
            ...state.documentItemPane,
            currentId: "",
          },
        }

      | _ => state
      }

    | None => state
    }

  | Action.ToBelowDocument() =>
    switch state->State.DocumentPane.currentDocument {
    | Some(currentDocument) =>
      switch state->State.DocumentPane.belowDocument(currentDocument) {
      | Some({id: belowId}) => {
          ...state,
          documentPane: {
            ...state.documentPane,
            currentId: belowId,
          },
          documentItemPane: {
            ...state.documentItemPane,
            currentId: "",
          },
        }

      | None => state
      }

    | None => state
    }

  | Action.ToInsertMode({initialCursorPosition}) =>
    let editingText = switch state->State.DocumentPane.currentDocument {
    | Some({text}) => text

    | None => ""
    }

    {
      ...state,
      documentPane: {
        ...state.documentPane,
        editingText: editingText,
      },
      mode: State.Insert({initialCursorPosition: initialCursorPosition}),
    }

  | Action.ToNormalMode() => {
      ...state,
      mode: State.Normal,
    }

  | Action.ToDocumentItemPane() =>
    if state.documentItemPane.currentId == "" {
      switch state->State.DocumentItemPane.rootItem {
      | Some({firstChildId}) => {
          ...state,
          focus: State.DocumentItemPane,
          documentPane: {
            ...state.documentPane,
            editingText: "",
          },
          documentItemPane: {
            ...state.documentItemPane,
            currentId: firstChildId,
          },
        }

      | None => state
      }
    } else {
      {
        ...state,
        focus: State.DocumentItemPane,
        documentPane: {
          ...state.documentPane,
          editingText: "",
        },
      }
    }

  | Action.SetEditingText({text}) => {
      ...state,
      documentPane: {
        ...state.documentPane,
        editingText: text,
      },
    }

  | Action.SetCurrentDocument({id, initialCursorPosition}) =>
    switch state.mode {
    | State.Normal => {
        ...state,
        documentPane: {
          ...state.documentPane,
          currentId: id,
        },
        documentItemPane: {
          ...state.documentItemPane,
          currentId: "",
        },
      }

    | State.Insert(_) => {
        let editingText = switch state->State.DocumentPane.getDocument(id) {
        | Some({text}) => text

        | None => ""
        }

        {
          ...state,
          mode: State.Insert({initialCursorPosition: initialCursorPosition}),
          documentPane: {
            ...state.documentPane,
            currentId: id,
            editingText: editingText,
          },
          documentItemPane: {
            ...state.documentItemPane,
            currentId: "",
          },
        }
      }
    }
  }
}

let documentItemPaneReducer = (state: State.t, action) => {
  Js.log(state)

  switch action {
  | Action.ToAboveItem() =>
    switch state->State.DocumentItemPane.currentItem {
    | Some(item) =>
      switch state->State.DocumentItemPane.aboveItem(item) {
      | Some({id: aboveId, parentId: aboveParentId}) if aboveParentId != "" => {
          ...state,
          documentItemPane: {
            ...state.documentItemPane,
            currentId: aboveId,
          },
        }

      | _ => state
      }

    | None =>
      switch state->State.DocumentItemPane.rootItem {
      | Some({firstChildId}) => {
          ...state,
          documentItemPane: {
            ...state.documentItemPane,
            currentId: firstChildId,
          },
        }

      | None => state
      }
    }

  | Action.ToBelowItem() =>
    switch state->State.DocumentItemPane.currentItem {
    | Some(item) =>
      switch state->State.DocumentItemPane.belowItem(item) {
      | Some({id: belowId}) => {
          ...state,
          documentItemPane: {
            ...state.documentItemPane,
            currentId: belowId,
          },
        }

      | _ => state
      }

    | None =>
      switch state->State.DocumentItemPane.rootItem {
      | Some({firstChildId}) => {
          ...state,
          documentItemPane: {
            ...state.documentItemPane,
            currentId: firstChildId,
          },
        }

      | _ => state
      }
    }

  | Action.ToTopItem() =>
    switch state->State.DocumentItemPane.topItem {
    | Some(topItem) => {
        ...state,
        documentItemPane: {
          ...state.documentItemPane,
          currentId: topItem.id,
        },
      }

    | None => state
    }

  | Action.ToBottomItem() =>
    switch state->State.DocumentItemPane.bottomItem {
    | Some(bottomItem) => {
        ...state,
        documentItemPane: {
          ...state.documentItemPane,
          currentId: bottomItem.id,
        },
      }

    | None => state
    }

  | Action.ToDocumentPane() => {
      ...state,
      focus: State.DocumentPane,
    }

  | Action.ToInsertMode({initialCursorPosition}) =>
    let editingText = switch state->State.DocumentItemPane.currentItem {
    | Some({text}) => text

    | None => ""
    }

    {
      ...state,
      documentItemPane: {
        ...state.documentItemPane,
        editingText: editingText,
      },
      mode: State.Insert({initialCursorPosition: initialCursorPosition}),
    }

  | Action.ToNormalMode() => {
      ...state,
      mode: State.Normal,
      documentItemPane: {
        ...state.documentItemPane,
        editingText: "",
      },
    }

  | Action.SetEditingText({text}) => {
      ...state,
      documentItemPane: {
        ...state.documentItemPane,
        editingText: text,
      },
    }

  | Action.SetCurrentItem({id, initialCursorPosition}) =>
    switch state.mode {
    | State.Normal => {
        ...state,
        documentItemPane: {
          ...state.documentItemPane,
          currentId: id,
        },
      }

    | State.Insert(_) => {
        let editingText = switch state->State.DocumentItemPane.getItem(id) {
        | Some({text}) => text

        | None => ""
        }

        {
          ...state,
          mode: State.Insert({initialCursorPosition: initialCursorPosition}),
          documentItemPane: {
            ...state.documentItemPane,
            currentId: id,
            editingText: editingText,
          },
        }
      }
    }
  }
}

let reducer = (state: State.t, action) => {
  switch action {
  | Action.KeyDown(_)
  | Action.FirestoreDocumentItemPane(_)
  | Action.FirestoreDocumentPane(_) =>
    raise(ActionShouldBeProcessedByMiddleware(action))

  | Action.DocumentPane(action) => documentPaneReducer(state, action)
  | Action.DocumentItemPane(action) => documentItemPaneReducer(state, action)

  | Action.SetDocumentItemPaneState({map}) => {
      ...state,
      documentItemPane: {
        ...state.documentItemPane,
        map: map,
      },
    }

  | Action.SetDocumentPaneState({map, rootId}) => {
      ...state,
      documentPane: {
        ...state.documentPane,
        map: map,
        rootId: rootId,
      },
    }

  | Action.DevToolUpdate({state}) => state
  }
}
