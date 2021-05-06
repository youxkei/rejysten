open Belt

let get = HashMap.String.get

exception ActionShouldBeProcessedByMiddleware(Action.t)

let documentPaneReducer = (state: State.t, action) => {
  switch action {
  | Action.ToAboveDocument() =>
    switch state->State.DocumentPane.current {
    | Some(currentDocument) =>
      switch state->State.DocumentPane.above(currentDocument) {
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
    switch state->State.DocumentPane.current {
    | Some(currentDocument) =>
      switch state->State.DocumentPane.below(currentDocument) {
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
    let editingText = switch state->State.DocumentPane.current {
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
      switch state->State.DocumentPane.currentRootDocumentItem {
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
        let editingText = switch state->State.DocumentPane.get(id) {
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
  switch action {
  | Action.ToAboveItem() =>
    switch state->State.DocumentItemPane.current {
    | Some(item) =>
      switch state->State.DocumentItemPane.above(item) {
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
      switch state->State.DocumentPane.currentRootDocumentItem {
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
    switch state->State.DocumentItemPane.current {
    | Some(item) =>
      switch state->State.DocumentItemPane.below(item) {
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
      switch state->State.DocumentPane.currentRootDocumentItem {
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

  | Action.ToDocumentPane() => {
      ...state,
      focus: State.DocumentPane,
    }

  | Action.ToInsertMode({initialCursorPosition}) =>
    let editingText = switch state->State.DocumentItemPane.current {
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
        let editingText = switch state->State.DocumentItemPane.get(id) {
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
