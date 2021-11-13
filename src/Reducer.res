open Belt

let get = HashMap.String.get

exception ActionShouldBeProcessedByMiddleware(Action.t)

module ItemEditor = {
  let reducer = (state: State.t, action: Action.itemEditor) => {
    switch action {
    | Action.SetEditingText({text}) => {
        ...state,
        itemEditor: {
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
      switch state->State.Note.DocumentPane.selectedDocument {
      | Some(selectedDocument) =>
        switch state->State.Note.DocumentPane.aboveDocument(selectedDocument) {
        | Some({id: aboveId, parentId: aboveParentId}) if aboveParentId != "" => {
            ...state,
            note: {
              documentPane: {
                ...state.note.documentPane,
                selectedId: aboveId,
              },
              itemPane: {
                selectedId: "",
              },
            },
          }

        | _ => state
        }

      | None =>
        switch state->State.Firestore.rootDocument {
        | Some({firstChildId}) => {
            ...state,
            note: {
              ...state.note,
              documentPane: {
                ...state.note.documentPane,
                selectedId: firstChildId,
              },
            },
          }

        | None => state
        }
      }

    | Action.ToBelowDocument() =>
      switch state->State.Note.DocumentPane.selectedDocument {
      | Some(selectedDocument) =>
        switch state->State.Note.DocumentPane.belowDocument(selectedDocument) {
        | Some({id: belowId}) => {
            ...state,
            note: {
              documentPane: {
                ...state.note.documentPane,
                selectedId: belowId,
              },
              itemPane: {
                selectedId: "",
              },
            },
          }

        | None => state
        }

      | None =>
        switch state->State.Firestore.rootDocument {
        | Some({firstChildId}) => {
            ...state,
            note: {
              ...state.note,
              documentPane: {
                ...state.note.documentPane,
                selectedId: firstChildId,
              },
            },
          }

        | None => state
        }
      }

    | Action.ToInsertMode({initialCursorPosition}) =>
      let editingText = switch state->State.Note.DocumentPane.selectedDocument {
      | Some({text}) => text

      | None => ""
      }

      {
        ...state,
        note: {
          ...state.note,
          documentPane: {
            ...state.note.documentPane,
            editingText: editingText,
          },
        },
        mode: State.Insert({initialCursorPosition: initialCursorPosition}),
      }

    | Action.ToNormalMode() => {
        ...state,
        mode: State.Normal(),
      }

    | Action.SetEditingText({text}) => {
        ...state,
        note: {
          ...state.note,
          documentPane: {
            ...state.note.documentPane,
            editingText: text,
          },
        },
      }

    | Action.SetSelectedDocument({id, initialCursorPosition}) =>
      switch state.mode {
      | State.Normal() => {
          ...state,
          note: {
            documentPane: {
              ...state.note.documentPane,
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
            note: {
              documentPane: {
                selectedId: id,
                editingText: editingText,
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
      switch state->State.Note.ItemPane.selectedItem {
      | Some(item) =>
        switch state->State.Note.ItemPane.aboveItem(item) {
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

      | None =>
        switch state->State.Note.ItemPane.rootItem {
        | Some({firstChildId}) => {
            ...state,
            note: {
              ...state.note,
              itemPane: {
                selectedId: firstChildId,
              },
            },
          }

        | None => state
        }
      }

    | Action.ToBelowItem() =>
      switch state->State.Note.ItemPane.selectedItem {
      | Some(item) =>
        switch state->State.Note.ItemPane.belowItem(item) {
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

      | None =>
        switch state->State.Note.ItemPane.rootItem {
        | Some({firstChildId}) => {
            ...state,
            note: {
              ...state.note,
              itemPane: {
                selectedId: firstChildId,
              },
            },
          }

        | _ => state
        }
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

    | Action.ToInsertMode({initialCursorPosition}) =>
      let editingText = switch state->State.Note.ItemPane.selectedItem {
      | Some({text}) => text

      | None => ""
      }

      {
        ...state,
        itemEditor: {
          editingText: editingText,
        },
        mode: State.Insert({initialCursorPosition: initialCursorPosition}),
      }

    | Action.ToNormalMode() => {
        ...state,
        mode: State.Normal(),
        itemEditor: {
          editingText: "",
        },
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
            itemEditor: {
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

  | Action.ToInsertMode({initialCursorPosition}) => {
      ...state,
      mode: State.Insert({initialCursorPosition: initialCursorPosition}),
    }

  | Action.ToNormalMode() => {
      ...state,
      mode: State.Normal(),
    }
  }
}

let reducer = (state: State.t, action) => {
  switch action {
  | Action.Event(_)
  | Action.FirestoreNote(_) =>
    raise(ActionShouldBeProcessedByMiddleware(action))

  | Action.Note(Action.DocumentPane(action)) => Note.documentPaneReducer(state, action)
  | Action.Note(Action.ItemPane(action)) => Note.documentItemPaneReducer(state, action)
  | Action.Search(action) => searchReducer(state, action)

  | Action.ItemEditor(action) => ItemEditor.reducer(state, action)

  | Action.FocusNote(Action.DocumentPane()) => {
      ...state,
      focus: State.Note(State.DocumentPane()),
    }

  | Action.FocusNote(Action.ItemPane()) =>
    if state.note.itemPane.selectedId == "" {
      switch state->State.Note.ItemPane.rootItem {
      | Some({firstChildId}) => {
          ...state,
          focus: State.Note(State.ItemPane()),
          note: {
            documentPane: {
              ...state.note.documentPane,
              editingText: "",
            },
            itemPane: {
              selectedId: firstChildId,
            },
          },
        }

      | None => state
      }
    } else {
      {
        ...state,
        focus: State.Note(State.ItemPane()),
        note: {
          ...state.note,
          documentPane: {
            ...state.note.documentPane,
            editingText: "",
          },
        },
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
          ...state.note.documentPane,
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

  | Action.SetActionLogState({selectedId}) => {
      ...state,
      actionLog: {
        selectedId: selectedId,
      },
    }

  | Action.DevToolUpdate({state}) => state
  }
}
