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
      switch state->Selector.Note.DocumentPane.aboveSelectedDocument {
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
      switch state->Selector.Note.DocumentPane.belowSelectedDocument {
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
          let editingText = switch state->Selector.Firestore.getDocument(id) {
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
      switch state->Selector.Note.ItemPane.aboveSelectedItem {
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
      switch state->Selector.Note.ItemPane.belowSelectedItem {
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
      switch state->Selector.Note.ItemPane.topItem {
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
      switch state->Selector.Note.ItemPane.bottomItem {
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
          let editingText = switch state->Selector.Firestore.getItem(id) {
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
    switch state->Selector.ActionLog.aboveSelectedActionLogAcrossRecentDateActionLogs {
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
    switch state->Selector.ActionLog.belowSelectedActionLogAcrossRecentDateActionLogs {
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

  | Action.ToAboveActionLogItem() =>
    switch state->Selector.ActionLog.aboveSelectedActionLogItem {
    | Some(aboveActionLogItem) if aboveActionLogItem.parentId != "" => {
        ...state,
        actionLog: {
          ...state.actionLog,
          selectedActionLogItemId: aboveActionLogItem.id,
        },
      }

    | _ => state
    }

  | Action.ToBelowActionLogItem() =>
    switch state->Selector.ActionLog.belowSelectedActionLogItem {
    | Some(belowSelectedActionLogItem) => {
        ...state,
        actionLog: {
          ...state.actionLog,
          selectedActionLogItemId: belowSelectedActionLogItem.id,
        },
      }

    | None => state
    }

  | Action.ToTopActionLogItem() =>
    switch state->Selector.ActionLog.topSelectedActionLogItem {
    | Some(topSelectedActionLogItem) => {
        ...state,
        actionLog: {
          ...state.actionLog,
          selectedActionLogItemId: topSelectedActionLogItem.id,
        },
      }

    | None => state
    }

  | Action.ToBottomActionLogItem() =>
    switch state->Selector.ActionLog.bottomSelectedActionLogItem {
    | Some(bottomSelectedActionLogItem) => {
        ...state,
        actionLog: {
          ...state.actionLog,
          selectedActionLogItemId: bottomSelectedActionLogItem.id,
        },
      }

    | None => state
    }

  | Action.SetSelectedActionLog({
      selectedDateActionLogId,
      selectedActionLogId,
      initialCursorPosition,
    }) =>
    let state = {
      ...state,
      actionLog: {
        ...state.actionLog,
        selectedDateActionLogId: selectedDateActionLogId,
        selectedActionLogId: selectedActionLogId,
      },
    }

    switch state.mode {
    | State.Normal() => state

    | State.Insert(_) => {
        ...state,
        mode: State.Insert({initialCursorPosition: initialCursorPosition}),
        editor: {
          editingText: state->Selector.selectedText,
        },
      }
    }

  | Action.SetSelectedActionLogItem({selectedActionLogItemId, initialCursorPosition}) =>
    let state = {
      ...state,
      actionLog: {
        ...state.actionLog,
        selectedActionLogItemId: selectedActionLogItemId,
      },
    }

    switch state.mode {
    | State.Normal() => state

    | State.Insert(_) => {
        ...state,
        mode: State.Insert({initialCursorPosition: initialCursorPosition}),
        editor: {
          editingText: state->Selector.selectedText,
        },
      }
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

  | Action.ToInsertMode({initialCursorPosition}) =>
    Js.log(`ToInsertMode "${state->Selector.selectedText}"`)
    {
      ...state,
      mode: State.Insert({initialCursorPosition: initialCursorPosition}),
      editor: {
        editingText: state->Selector.selectedText,
      },
    }

  | Action.ToNormalMode() => {
      ...state,
      mode: State.Normal(),
    }

  | Action.Focus(focus) =>
    switch focus {
    | State.Note(State.ItemPane()) if state.note.itemPane.selectedId == "" =>
      switch state->Selector.Note.ItemPane.bottomItem {
      | Some(bottomItem) => {
          ...state,
          focus: focus,
          note: {
            ...state.note,
            itemPane: {
              selectedId: bottomItem.id,
            },
          },
        }

      | None => state
      }

    | State.ActionLog(State.Items()) =>
      switch state->Selector.ActionLog.selectedActionLogBottomItem {
      | Some(bottomItem) => {
          ...state,
          focus: focus,
          actionLog: {
            ...state.actionLog,
            selectedActionLogItemId: bottomItem.id,
          },
        }

      | None => state
      }

    | _ => {
        ...state,
        focus: focus,
      }
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
