@get external code: Dom.keyboardEvent => string = "code"
@get external shiftKey: Dom.keyboardEvent => bool = "shiftKey"
@get external ctrlKey: Dom.keyboardEvent => bool = "ctrlKey"
@get external isComposing: Dom.keyboardEvent => bool = "isComposing"
@send external preventDefault: Dom.keyboardEvent => unit = "preventDefault"

module KeyDown = {
  module Note = {
    module DocumentPane = {
      module Normal = {
        let handler = (store, event) => {
          let dispatch = Reductive.Store.dispatch(store)

          let code = event->code
          let ctrlKey = event->ctrlKey
          let shiftKey = event->shiftKey

          switch code {
          | "Tab" if !ctrlKey && !shiftKey => {
              dispatch(Action.Firestore(Action.Note(Action.DocumentPane(Action.IndentDocument()))))
              event->preventDefault
            }

          | "Tab" if !ctrlKey && shiftKey => {
              dispatch(
                Action.Firestore(Action.Note(Action.DocumentPane(Action.UnindentDocument()))),
              )
              event->preventDefault
            }

          | "KeyJ" if !ctrlKey && !shiftKey => {
              dispatch(Action.Note(Action.DocumentPane(Action.ToBelowDocument())))
              event->preventDefault
            }

          | "KeyK" if !ctrlKey && !shiftKey => {
              dispatch(Action.Note(Action.DocumentPane(Action.ToAboveDocument())))
              event->preventDefault
            }

          | "KeyL" if !ctrlKey && !shiftKey => {
              dispatch(Action.FocusNote(Action.ItemPane()))
              event->preventDefault
            }

          | "KeyO" if !ctrlKey => {
              let direction = if shiftKey {
                Action.Prev()
              } else {
                Action.Next()
              }

              dispatch(
                Action.Firestore(
                  Action.Note(Action.DocumentPane(Action.AddDocument({direction: direction}))),
                ),
              )
              dispatch(Action.ToInsertMode({initialCursorPosition: State.Start()}))
            }

          | "KeyI" if !ctrlKey && !shiftKey => {
              dispatch(Action.ToInsertMode({initialCursorPosition: State.Start()}))
              event->preventDefault
            }

          | "KeyA" if !ctrlKey && !shiftKey => {
              dispatch(Action.ToInsertMode({initialCursorPosition: State.End()}))
              event->preventDefault
            }

          | "KeyO" if !ctrlKey => {
              let direction = if shiftKey {
                Action.Prev()
              } else {
                Action.Next()
              }

              dispatch(
                Action.Firestore(
                  Action.Note(Action.DocumentPane(Action.AddDocument({direction: direction}))),
                ),
              )
              dispatch(Action.ToInsertMode({initialCursorPosition: State.Start()}))

              event->preventDefault
            }

          | "KeyL" if !ctrlKey && shiftKey => {
              dispatch(Action.FocusActionLog(State.Record(State.Text())))
              event->preventDefault
            }

          | "Slash" if !ctrlKey && !shiftKey => {
              dispatch(Action.FocusSearch())
              event->preventDefault
            }

          | _ => ()
          }
        }
      }

      module Insert = {
        let handler = (store, event) => {
          let dispatch = Reductive.Store.dispatch(store)
          let state: State.t = Reductive.Store.getState(store)

          let code = event->code
          let ctrlKey = event->ctrlKey
          let shiftKey = event->shiftKey
          let isComposing = event->isComposing
          let isNeutral = !ctrlKey && !isComposing

          switch code {
          | "Escape" if isNeutral && !shiftKey =>
            dispatch(Action.Firestore(Action.Note(Action.DocumentPane(Action.SaveDocument()))))
            dispatch(Action.ToNormalMode())

          | "Tab" if isNeutral && !shiftKey =>
            dispatch(Action.Firestore(Action.Note(Action.DocumentPane(Action.IndentDocument()))))
            event->preventDefault

          | "Tab" if isNeutral && shiftKey =>
            dispatch(Action.Firestore(Action.Note(Action.DocumentPane(Action.UnindentDocument()))))
            event->preventDefault

          | "Enter" if isNeutral && !shiftKey =>
            dispatch(
              Action.Firestore(
                Action.Note(Action.DocumentPane(Action.AddDocument({direction: Action.Next()}))),
              ),
            )
            event->preventDefault

          | "Backspace" if isNeutral && !shiftKey && state.editor.editingText == "" =>
            switch state->State.Note.DocumentPane.selectedDocument {
            | Some({firstChildId: "", lastChildId: ""}) =>
              // selected document has no children
              switch state->State.Note.DocumentPane.aboveSelectedDocument {
              | Some({id: aboveId, parentId: aboveParentId}) if aboveParentId != "" =>
                switch state->State.Note.ItemPane.topItem {
                | Some({text: "", prevId: "", nextId: "", firstChildId: "", lastChildId: ""}) =>
                  dispatch(
                    Action.Firestore(
                      Action.Note(
                        Action.DocumentPane(
                          Action.DeleteDocument({
                            nextSelectedId: aboveId,
                            initialCursorPosition: State.End(),
                          }),
                        ),
                      ),
                    ),
                  )

                  event->preventDefault

                | _ => ()
                }

              | _ => ()
              }

            | _ => ()
            }

          | "Delete" if isNeutral && !shiftKey && state.editor.editingText == "" =>
            switch state->State.Note.DocumentPane.selectedDocument {
            | Some({firstChildId: "", lastChildId: ""}) =>
              // selected document has no children
              switch state->State.Note.DocumentPane.belowSelectedDocument {
              | Some({id: belowId, parentId: belowParentId}) if belowParentId != "" =>
                switch state->State.Note.ItemPane.topItem {
                | Some({text: "", prevId: "", nextId: "", firstChildId: "", lastChildId: ""}) =>
                  dispatch(
                    Action.Firestore(
                      Action.Note(
                        Action.DocumentPane(
                          Action.DeleteDocument({
                            nextSelectedId: belowId,
                            initialCursorPosition: State.Start(),
                          }),
                        ),
                      ),
                    ),
                  )

                  event->preventDefault

                | _ => ()
                }

              | _ => ()
              }

            | _ => ()
            }

          | _ => ()
          }
        }
      }
    }

    module ItemPane = {
      module Normal = {
        let handler = (store, event) => {
          let dispatch = Reductive.Store.dispatch(store)

          let code = event->code
          let ctrlKey = event->ctrlKey
          let shiftKey = event->shiftKey

          switch code {
          | "Tab" if !ctrlKey && !shiftKey => {
              dispatch(Action.Firestore(Action.Note(Action.ItemPane(Action.IndentItem()))))
              event->preventDefault
            }

          | "Tab" if !ctrlKey && shiftKey => {
              dispatch(Action.Firestore(Action.Note(Action.ItemPane(Action.UnindentItem()))))
              event->preventDefault
            }

          | "KeyH" if !ctrlKey && !shiftKey => {
              dispatch(Action.FocusNote(Action.DocumentPane()))
              event->preventDefault
            }

          | "KeyJ" if !ctrlKey && !shiftKey => {
              dispatch(Action.Note(Action.ItemPane(Action.ToBelowItem())))
              event->preventDefault
            }

          | "KeyK" if !ctrlKey && !shiftKey => {
              dispatch(Action.Note(Action.ItemPane(Action.ToAboveItem())))
              event->preventDefault
            }

          | "KeyI" if !ctrlKey && !shiftKey => {
              dispatch(Action.ToInsertMode({initialCursorPosition: State.Start()}))
              event->preventDefault
            }

          | "KeyA" if !ctrlKey && !shiftKey => {
              dispatch(Action.ToInsertMode({initialCursorPosition: State.End()}))
              event->preventDefault
            }

          | "KeyO" if !ctrlKey => {
              let direction = if shiftKey {
                Action.Prev()
              } else {
                Action.Next()
              }

              dispatch(
                Action.Firestore(
                  Action.Note(Action.ItemPane(Action.AddItem({direction: direction}))),
                ),
              )
              dispatch(Action.ToInsertMode({initialCursorPosition: State.Start()}))

              event->preventDefault
            }

          | "KeyG" if !ctrlKey =>
            if shiftKey {
              dispatch(Action.Note(Action.ItemPane(Action.ToBottomItem())))
            } else {
              dispatch(Action.Note(Action.ItemPane(Action.ToTopItem())))
            }

          | "KeyL" if !ctrlKey && shiftKey => {
              dispatch(Action.FocusActionLog(State.Record(State.Text())))
              event->preventDefault
            }

          | "Slash" if !ctrlKey && !shiftKey => {
              dispatch(Action.FocusSearch())
              event->preventDefault
            }

          | _ => ()
          }
        }
      }

      module Insert = {
        let handler = (store, event) => {
          let dispatch = Reductive.Store.dispatch(store)
          let state: State.t = Reductive.Store.getState(store)

          let code = event->code
          let ctrlKey = event->ctrlKey
          let shiftKey = event->shiftKey
          let isComposing = event->isComposing
          let isNeutral = !ctrlKey && !isComposing

          switch code {
          | "Escape" if isNeutral && !shiftKey => {
              dispatch(Action.Firestore(Action.Note(Action.ItemPane(Action.SaveItem()))))
              dispatch(Action.ToNormalMode())
            }

          | "Tab" if isNeutral && !shiftKey => {
              dispatch(Action.Firestore(Action.Note(Action.ItemPane(Action.IndentItem()))))
              event->preventDefault
            }

          | "Tab" if isNeutral && shiftKey => {
              dispatch(Action.Firestore(Action.Note(Action.ItemPane(Action.UnindentItem()))))
              event->preventDefault
            }

          | "Enter" if isNeutral && !shiftKey => {
              dispatch(
                Action.Firestore(
                  Action.Note(Action.ItemPane(Action.AddItem({direction: Action.Next()}))),
                ),
              )
              event->preventDefault
            }

          | "Backspace" if isNeutral && !shiftKey && state.editor.editingText == "" =>
            switch state->State.Note.ItemPane.selectedItem {
            | Some({firstChildId: "", lastChildId: ""}) =>
              // selected item has no children
              switch state->State.Note.ItemPane.aboveSelectedItem {
              | Some({id: aboveId, parentId: aboveParentId}) if aboveParentId != "" => {
                  dispatch(
                    Action.Firestore(
                      Action.Note(
                        Action.ItemPane(
                          Action.DeleteItem({
                            nextSelectedId: aboveId,
                            initialCursorPosition: State.End(),
                          }),
                        ),
                      ),
                    ),
                  )

                  event->preventDefault
                }

              | _ => ()
              }

            | _ => ()
            }

          | "Delete" if isNeutral && !shiftKey && state.editor.editingText == "" =>
            switch state->State.Note.ItemPane.selectedItem {
            | Some({firstChildId: "", lastChildId: ""}) =>
              // selected item has no children
              switch state->State.Note.ItemPane.belowSelectedItem {
              | Some({id: belowId, parentId: belowParentId}) if belowParentId != "" => {
                  dispatch(
                    Action.Firestore(
                      Action.Note(
                        Action.ItemPane(
                          Action.DeleteItem({
                            nextSelectedId: belowId,
                            initialCursorPosition: State.Start(),
                          }),
                        ),
                      ),
                    ),
                  )

                  event->preventDefault
                }

              | _ => ()
              }

            | _ => ()
            }

          | _ => ()
          }
        }
      }
    }
  }

  module Search = {
    module Normal = {
      let handler = (store, event) => {
        let dispatch = Reductive.Store.dispatch(store)

        let code = event->code

        switch code {
        | "Escape" => dispatch(Action.FocusNote(Action.ItemPane()))

        | _ => ()
        }
      }
    }

    module Insert = {
      let handler = (_store, _event) => {
        ()
      }
    }
  }

  module ActionLog = {
    module Record = {
      module Normal = {
        let handler = (store, event) => {
          let dispatch = Reductive.Store.dispatch(store)

          let code = event->code
          let ctrlKey = event->ctrlKey
          let shiftKey = event->shiftKey

          switch code {
          | "KeyN" if !ctrlKey && shiftKey =>
            dispatch(Action.FocusNote(Action.ItemPane()))
            event->preventDefault

          | "KeyK" if !ctrlKey && !shiftKey =>
            dispatch(Action.ActionLog(Action.ToAboveActionLog()))
            event->preventDefault

          | "KeyJ" if !ctrlKey && !shiftKey =>
            dispatch(Action.ActionLog(Action.ToBelowActionLog()))
            event->preventDefault

          | "KeyI" if !ctrlKey && !shiftKey =>
            dispatch(Action.ToInsertMode({initialCursorPosition: State.Start()}))
            event->preventDefault

          | "KeyA" if !ctrlKey && !shiftKey =>
            dispatch(Action.ToInsertMode({initialCursorPosition: State.End()}))
            event->preventDefault

          | "KeyO" if !ctrlKey && !shiftKey =>
            dispatch(
              Action.Firestore(Action.ActionLog(Action.AddActionLog({direction: Action.Next()}))),
            )
            dispatch(Action.ToInsertMode({initialCursorPosition: State.Start()}))
            event->preventDefault

          | "KeyS" if !ctrlKey && !shiftKey =>
            dispatch(Action.Firestore(Action.ActionLog(Action.StartActionLog())))
            event->preventDefault

          | "KeyF" if !ctrlKey && !shiftKey =>
            dispatch(Action.Firestore(Action.ActionLog(Action.FinishActionLog())))
            event->preventDefault

          | "KeyL" if !ctrlKey && !shiftKey =>
            dispatch(Action.FocusActionLog(State.Items()))
            event->preventDefault

          | _ => ()
          }
        }
      }

      module Insert = {
        let handler = (store, event, initialCursorPosition, focus) => {
          let dispatch = Reductive.Store.dispatch(store)

          let code = event->code
          let ctrlKey = event->ctrlKey
          let shiftKey = event->shiftKey
          let isComposing = event->isComposing
          let isNeutral = !ctrlKey && !isComposing

          switch code {
          | "Escape" if isNeutral && !shiftKey =>
            dispatch(Action.Firestore(Action.ActionLog(Action.SaveActionLog())))
            dispatch(Action.FocusActionLog(State.Record(State.Text())))
            dispatch(Action.ToNormalMode())

          | "Tab" if isNeutral && !shiftKey =>
            switch focus {
            | State.Text() =>
              dispatch(Action.Firestore(Action.ActionLog(Action.SaveActionLog())))
              dispatch(Action.FocusActionLog(State.Record(State.Begin())))
              dispatch(Action.ToInsertMode({initialCursorPosition: initialCursorPosition}))

            | State.Begin() =>
              dispatch(Action.Firestore(Action.ActionLog(Action.SaveActionLog())))
              dispatch(Action.FocusActionLog(State.Record(State.End())))
              dispatch(Action.ToInsertMode({initialCursorPosition: initialCursorPosition}))

            | State.End() =>
              dispatch(Action.Firestore(Action.ActionLog(Action.SaveActionLog())))
              dispatch(Action.FocusActionLog(State.Record(State.Text())))
              dispatch(Action.ToInsertMode({initialCursorPosition: initialCursorPosition}))
            }

            event->preventDefault

          | "Tab" if isNeutral && shiftKey =>
            switch focus {
            | State.Text() =>
              dispatch(Action.Firestore(Action.ActionLog(Action.SaveActionLog())))
              dispatch(Action.FocusActionLog(State.Record(State.End())))
              dispatch(Action.ToInsertMode({initialCursorPosition: initialCursorPosition}))

            | State.Begin() =>
              dispatch(Action.Firestore(Action.ActionLog(Action.SaveActionLog())))
              dispatch(Action.FocusActionLog(State.Record(State.Text())))
              dispatch(Action.ToInsertMode({initialCursorPosition: initialCursorPosition}))

            | State.End() =>
              dispatch(Action.Firestore(Action.ActionLog(Action.SaveActionLog())))
              dispatch(Action.FocusActionLog(State.Record(State.Begin())))
              dispatch(Action.ToInsertMode({initialCursorPosition: initialCursorPosition}))
            }

            event->preventDefault

          | _ => ()
          }
        }
      }
    }

    module Items = {
      module Normal = {
        let handler = (store, event) => {
          let dispatch = Reductive.Store.dispatch(store)

          let code = event->code
          let ctrlKey = event->ctrlKey
          let shiftKey = event->shiftKey

          switch code {
          | "KeyH" if !ctrlKey && !shiftKey =>
            dispatch(Action.FocusActionLog(State.Record(State.Text())))
            event->preventDefault

          | _ => ()
          }
        }
      }

      module Insert = {
        let handler = (_store, _event) => ()
      }
    }
  }
}

module Click = {
  module Note = {
    let handler = (store, _event, isDouble, target) => {
      let dispatch = Reductive.Store.dispatch(store)

      switch target {
      | Event.Document(documentId) =>
        dispatch(Action.FocusNote(Action.DocumentPane()))
        dispatch(
          Action.Note(
            Action.DocumentPane(
              Action.SetSelectedDocument({id: documentId, initialCursorPosition: State.End()}),
            ),
          ),
        )

        if isDouble {
          dispatch(Action.ToInsertMode({initialCursorPosition: State.End()}))
        } else {
          dispatch(Action.ToNormalMode())
        }

      | Event.Item(itemId) =>
        dispatch(Action.FocusNote(Action.ItemPane()))
        dispatch(
          Action.Note(
            Action.ItemPane(
              Action.SetSelectedItem({id: itemId, initialCursorPosition: State.End()}),
            ),
          ),
        )

        if isDouble {
          dispatch(Action.ToInsertMode({initialCursorPosition: State.End()}))
        } else {
          dispatch(Action.ToNormalMode())
        }
      }
    }
  }

  module Search = {
    let handler = (_store, _event, _isDouble, _target) => {
      ()
    }
  }

  module ActionLog = {
    let handler = (_store, _event, _isDouble, _target) => {
      ()
    }
  }
}

module Blur = {
  module Note = {
    module ItemPane = {
      let handler = (store, _event) => {
        let dispatch = Reductive.Store.dispatch(store)

        dispatch(Action.Firestore(Action.Note(Action.ItemPane(Action.SaveItem()))))
        dispatch(Action.ToNormalMode())
      }
    }

    module DocumentPane = {
      let handler = (store, _event) => {
        let dispatch = Reductive.Store.dispatch(store)

        dispatch(Action.Firestore(Action.Note(Action.DocumentPane(Action.SaveDocument()))))
        dispatch(Action.ToNormalMode())
      }
    }
  }

  module ActionLog = {
    module Record = {
      let handler = (store, _event) => {
        let dispatch = Reductive.Store.dispatch(store)

        dispatch(Action.Firestore(Action.ActionLog(Action.SaveActionLog())))
        dispatch(Action.FocusActionLog(State.Record(State.Text())))
        dispatch(Action.ToNormalMode())
      }
    }

    module Items = {
      let handler = (store, _event) => {
        let _dispatch = Reductive.Store.dispatch(store)
      }
    }
  }
}

let middleware = (store, next, action) => {
  switch action {
  | Action.Event(event) => {
      let state: State.t = Reductive.Store.getState(store)

      switch (event, state.focus, state.mode) {
      // KeyDownEvent
      // NoteDocumentPane
      | (Event.KeyDown({event}), State.Note(State.DocumentPane()), State.Normal()) =>
        KeyDown.Note.DocumentPane.Normal.handler(store, event)

      | (Event.KeyDown({event}), State.Note(State.DocumentPane()), State.Insert(_)) =>
        KeyDown.Note.DocumentPane.Insert.handler(store, event)

      // NoteItemPane
      | (Event.KeyDown({event}), State.Note(State.ItemPane()), State.Normal()) =>
        KeyDown.Note.ItemPane.Normal.handler(store, event)

      | (Event.KeyDown({event}), State.Note(State.ItemPane()), State.Insert(_)) =>
        KeyDown.Note.ItemPane.Insert.handler(store, event)

      // Search
      | (Event.KeyDown({event}), State.Search(), State.Normal()) =>
        KeyDown.Search.Normal.handler(store, event)

      | (Event.KeyDown({event}), State.Search(), State.Insert(_)) =>
        KeyDown.Search.Insert.handler(store, event)

      // ActionLogRecord
      | (Event.KeyDown({event}), State.ActionLog(State.Record(_focus)), State.Normal()) =>
        KeyDown.ActionLog.Record.Normal.handler(store, event)

      // ActionLogItems
      | (
          Event.KeyDown({event}),
          State.ActionLog(State.Record(focus)),
          State.Insert({initialCursorPosition}),
        ) =>
        KeyDown.ActionLog.Record.Insert.handler(store, event, initialCursorPosition, focus)

      // ActionLogItems
      | (Event.KeyDown({event}), State.ActionLog(State.Items()), State.Normal()) =>
        KeyDown.ActionLog.Items.Normal.handler(store, event)

      | (Event.KeyDown({event}), State.ActionLog(State.Items()), State.Insert(_)) =>
        KeyDown.ActionLog.Items.Insert.handler(store, event)

      // ClickEvent
      // Note
      | (Event.Click({event, isDouble, target}), State.Note(_), _) =>
        Click.Note.handler(store, event, isDouble, target)

      // Search
      | (Event.Click({event, isDouble, target}), State.Search(), _) =>
        Click.Search.handler(store, event, isDouble, target)

      // ActionLog
      | (Event.Click({event, isDouble, target}), State.ActionLog(_), _) =>
        Click.ActionLog.handler(store, event, isDouble, target)

      // BlurEvent
      // NoteDocumentPane
      | (Event.Blur(_), State.Note(State.DocumentPane()), _) =>
        Blur.Note.DocumentPane.handler(store, event)

      // NoteItemPane
      | (Event.Blur({event}), State.Note(State.ItemPane()), _) =>
        Blur.Note.ItemPane.handler(store, event)

      // Search
      | (Event.Blur(_), State.Search(), _) => ()

      // ActionLogRecord
      | (Event.Blur(_), State.ActionLog(State.Record(_focus)), _) =>
        Blur.ActionLog.Record.handler(store, event)

      // ActionLogItems
      | (Event.Blur(_), State.ActionLog(State.Items()), _) =>
        Blur.ActionLog.Items.handler(store, event)
      }
    }

  | _ => next(action)
  }
}
