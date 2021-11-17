open Belt

let get = HashMap.String.get

exception ActionShouldBeProcessedByMiddleware(Action.t)

module Editor = {
  let reducer = (state: State.t, action: Action.editor) => {
    switch action {
    | Action.SetEditingText({text}) => {
        ...state,
        editor: {
          editingText: text,
        },
      }
    }
  }
}

module Note = {
  let documentPaneReducer = (state: State.t, action) => {
    switch action {
    | Action.ToAboveDocument() =>
      switch state->State.Note.DocumentPane.aboveSelectedDocument {
      | Some({id: aboveId, parentId: aboveParentId}) if aboveParentId != "" => {
          ...state,
          note: {
            documentPane: {
              selectedId: aboveId,
            },
            itemPane: {
              selectedId: "",
            },
          },
        }

      | _ => state
      }

    | Action.ToBelowDocument() =>
      switch state->State.Note.DocumentPane.belowSelectedDocument {
      | Some({id: belowId}) => {
          ...state,
          note: {
            documentPane: {
              selectedId: belowId,
            },
            itemPane: {
              selectedId: "",
            },
          },
        }

      | None => state
      }

    | Action.SetSelectedDocument({id, initialCursorPosition}) =>
      switch state.mode {
      | State.Normal() => {
          ...state,
          note: {
            documentPane: {
              selectedId: id,
            },
            itemPane: {
              selectedId: "",
            },
          },
        }

      | State.Insert(_) => {
          let editingText = switch state->State.Firestore.getDocument(id) {
          | Some({text}) => text

          | None => ""
          }

          {
            ...state,
            mode: State.Insert({initialCursorPosition: initialCursorPosition}),
            editor: {
              editingText: editingText,
            },
            note: {
              documentPane: {
                selectedId: id,
              },
              itemPane: {
                selectedId: "",
              },
            },
          }
        }
      }
    }
  }

  let documentItemPaneReducer = (state: State.t, action) => {
    switch action {
    | Action.ToAboveItem() =>
      switch state->State.Note.ItemPane.aboveSelectedItem {
      | Some({id: aboveId, parentId: aboveParentId}) if aboveParentId != "" => {
          ...state,
          note: {
            ...state.note,
            itemPane: {
              selectedId: aboveId,
            },
          },
        }

      | _ => state
      }

    | Action.ToBelowItem() =>
      switch state->State.Note.ItemPane.belowSelectedItem {
      | Some({id: belowId}) => {
          ...state,
          note: {
            ...state.note,
            itemPane: {
              selectedId: belowId,
            },
          },
        }

      | _ => state
      }

    | Action.ToTopItem() =>
      switch state->State.Note.ItemPane.topItem {
      | Some(topItem) => {
          ...state,
          note: {
            ...state.note,
            itemPane: {
              selectedId: topItem.id,
            },
          },
        }

      | None => state
      }

    | Action.ToBottomItem() =>
      switch state->State.Note.ItemPane.bottomItem {
      | Some(bottomItem) => {
          ...state,
          note: {
            ...state.note,
            itemPane: {
              selectedId: bottomItem.id,
            },
          },
        }

      | None => state
      }

    | Action.SetSelectedItem({id, initialCursorPosition}) =>
      switch state.mode {
      | State.Normal() => {
          ...state,
          note: {
            ...state.note,
            itemPane: {
              selectedId: id,
            },
          },
        }

      | State.Insert(_) => {
          let editingText = switch state->State.Firestore.getItem(id) {
          | Some({text}) => text

          | None => ""
          }

          {
            ...state,
            mode: State.Insert({initialCursorPosition: initialCursorPosition}),
            editor: {
              editingText: editingText,
            },
            note: {
              ...state.note,
              itemPane: {
                selectedId: id,
              },
            },
          }
        }
      }
    }
  }
}

let searchReducer = (state: State.t, action) => {
  switch action {
  | Action.SetSearchingText({text}) => {
      ...state,
      search: {
        ...state.search,
        searchingText: text,
      },
    }
  }
}

let actionLogReducer = (state: State.t, action) => {
  switch action {
  | Action.ToAboveActionLog() =>
    switch state->State.ActionLog.aboveRecentActionLog {
    | Some(aboveActionLog) => {
        ...state,
        actionLog: {
          ...state.actionLog,
          selectedDateActionLogId: aboveActionLog.dateActionLogId,
          selectedActionLogId: aboveActionLog.id,
        },
      }

    | None => state
    }

  | Action.ToBelowActionLog() =>
    switch state->State.ActionLog.belowActionLog {
    | Some(belowActionLog) => {
        ...state,
        actionLog: {
          ...state.actionLog,
          selectedDateActionLogId: belowActionLog.dateActionLogId,
          selectedActionLogId: belowActionLog.id,
        },
      }

    | None => state
    }

  | Action.SetState({selectedDateActionLogId, selectedActionLogId}) => {
      ...state,
      actionLog: {
        ...state.actionLog,
        selectedDateActionLogId: selectedDateActionLogId,
        selectedActionLogId: selectedActionLogId,
      },
    }
  }
}

let reducer = (state: State.t, action) => {
  switch action {
  | Action.Event(_)
  | Action.Firestore(_) =>
    raise(ActionShouldBeProcessedByMiddleware(action))

  | Action.Editor(action) => Editor.reducer(state, action)

  | Action.Note(Action.DocumentPane(action)) => Note.documentPaneReducer(state, action)
  | Action.Note(Action.ItemPane(action)) => Note.documentItemPaneReducer(state, action)
  | Action.Search(action) => searchReducer(state, action)
  | Action.ActionLog(action) => actionLogReducer(state, action)

  | Action.DevToolUpdate({state}) => state

  | Action.ToInsertMode({initialCursorPosition}) => {
      ...state,
      mode: State.Insert({initialCursorPosition: initialCursorPosition}),
      editor: {
        editingText: state->State.selectedText,
      },
    }

  | Action.ToNormalMode() => {
      ...state,
      mode: State.Normal(),
    }

  | Action.FocusNote(Action.DocumentPane()) => {
      ...state,
      focus: State.Note(State.DocumentPane()),
    }

  | Action.FocusNote(Action.ItemPane()) =>
    if state.note.itemPane.selectedId == "" {
      switch state->State.Note.ItemPane.bottomItem {
      | Some(bottomItem) => {
          ...state,
          focus: State.Note(State.ItemPane()),
          note: {
            ...state.note,
            itemPane: {
              selectedId: bottomItem.id,
            },
          },
        }

      | None => state
      }
    } else {
      {
        ...state,
        focus: State.Note(State.ItemPane()),
      }
    }

  | Action.FocusSearch() => {
      ...state,
      focus: State.Search(),
    }

  | Action.FocusActionLog() => {
      ...state,
      focus: State.ActionLog(),
    }

  | Action.SetFirestoreDocumentState({documentMap, rootDocumentId}) => {
      ...state,
      firestore: {
        ...state.firestore,
        documentMap: documentMap,
        rootDocumentId: rootDocumentId,
      },
    }

  | Action.SetFirestoreItemState({itemMap}) => {
      ...state,
      firestore: {
        ...state.firestore,
        itemMap: itemMap,
      },
    }

  | Action.SetFirestoreDateActionLogState({dateActionLogMap, latestDateActionLogId}) => {
      ...state,
      firestore: {
        ...state.firestore,
        dateActionLogMap: dateActionLogMap,
        latestDateActionLogId: latestDateActionLogId,
      },
    }

  | Action.SetNoteDocumentPaneState({selectedId}) => {
      ...state,
      note: {
        ...state.note,
        documentPane: {
          selectedId: selectedId,
        },
      },
    }

  | Action.SetSearchState({ancestorDocuments, searchedDocuments, searchedItems}) => {
      ...state,
      search: {
        ...state.search,
        ancestorDocuments: ancestorDocuments,
        searchedDocuments: searchedDocuments,
        searchedItems: searchedItems,
      },
    }

  | Action.SetActionLogState({selectedDateActionLogId, selectedActionLogId}) => {
      ...state,
      actionLog: {
        ...state.actionLog,
        selectedDateActionLogId: selectedDateActionLogId,
        selectedActionLogId: selectedActionLogId,
      },
    }

  | Action.SetActionLogOldestRecentDateActionLogId({oldestRecentDateActionLogId}) => {
      ...state,
      actionLog: {
        ...state.actionLog,
        oldestRecentDateActionLogId: oldestRecentDateActionLogId,
      },
    }
  }
}
