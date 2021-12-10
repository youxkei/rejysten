open Belt

@module("uuid") external uuidv4: unit => string = "v4"

let recordMiddleware = (store: Redux.Store.t, action: Action.firestoreActionLogRecord) => {
  let state = Reductive.Store.getState(store)

  switch action {
  | Action.SaveText() =>
    switch state->Selector.ActionLog.selectedActionLog {
    | Some((_, {id, dateActionLogId})) =>
      switch state.mode {
      | State.Insert(_) =>
        open Firebase.Firestore

        Firebase.firestore
        ->collection("dateActionLogs")
        ->doc(dateActionLogId)
        ->updateField(fieldPath3("actionLogs", id, "text"), state.editor.editingText)

      | _ => ()
      }

    | _ => ()
    }

  | Action.SaveBegin() =>
    switch state->Selector.ActionLog.selectedActionLog {
    | Some(({date}, {id, dateActionLogId})) =>
      switch state.mode {
      | State.Insert(_) =>
        open Firebase.Firestore

        switch Date.parseEditString(date, state.editor.editingText) {
        | Some(beginDate) =>
          Firebase.firestore
          ->collection("dateActionLogs")
          ->doc(dateActionLogId)
          ->updateField(fieldPath3("actionLogs", id, "begin"), beginDate->Date.toUnixtimeMillis)

        | None => ()
        }

      | _ => ()
      }

    | _ => ()
    }

  | Action.SaveEnd() =>
    switch state->Selector.ActionLog.selectedActionLog {
    | Some(({date}, {id, dateActionLogId})) =>
      switch state.mode {
      | State.Insert(_) =>
        open Firebase.Firestore

        switch Date.parseEditString(date, state.editor.editingText) {
        | Some(endDate) =>
          Firebase.firestore
          ->collection("dateActionLogs")
          ->doc(dateActionLogId)
          ->updateField(fieldPath3("actionLogs", id, "end"), endDate->Date.toUnixtimeMillis)

        | None => ()
        }

      | _ => ()
      }

    | _ => ()
    }
  }
}

let itemsMiddleware = (store: Redux.Store.t, action: Action.firestoreActionLogItems) => {
  let state = Reductive.Store.getState(store)

  switch action {
  | Action.Save() =>
    switch state.mode {
    | State.Insert(_) =>
      switch state->Selector.ActionLog.selectedActionLogItem {
      | Some(dateActionLog, actionLog, item) =>
        open Firebase.Firestore

        Firebase.firestore
        ->collection("dateActionLogs")
        ->doc(dateActionLog.id)
        ->updateField(
          fieldPath5("actionLogs", actionLog.id, "items", item.id, "text"),
          state.editor.editingText,
        )

      | None => ()
      }

    | _ => ()
    }

  | Action.Add({direction}) =>
    switch state->Selector.ActionLog.selectedActionLogItem {
    | Some(selectedDateActionLog, selectedActionLog, selectedItem) =>
      open Firebase.Firestore

      let db = Firebase.firestore
      let writeBatch = db->writeBatch
      let selectedDateActionLogDoc = db->collection("dateActionLogs")->doc(selectedDateActionLog.id)

      let addingItemId = uuidv4()

      let itemPath = id => fieldPath4("actionLogs", selectedActionLog.id, "items", id)
      let itemPathWithField = (id, field) =>
        fieldPath5("actionLogs", selectedActionLog.id, "items", id, field)

      switch state.mode {
      | State.Insert(_) =>
        writeBatch->addUpdateField(
          selectedDateActionLogDoc,
          itemPathWithField(selectedItem.id, "text"),
          state.editor.editingText,
        )

      | _ => ()
      }

      switch direction {
      | Action.Prev() =>
        writeBatch->addUpdateField(
          selectedDateActionLogDoc,
          itemPathWithField(selectedItem.id, "prevId"),
          addingItemId,
        )

        writeBatch->addUpdateField(
          selectedDateActionLogDoc,
          itemPath(addingItemId),
          {
            "firstChildId": "",
            "lastChildId": "",
            "prevId": selectedItem.prevId,
            "parentId": selectedItem.parentId,
            "nextId": selectedItem.id,
            "text": "",
          },
        )

        if selectedItem.prevId == "" {
          if selectedItem.parentId != "" {
            writeBatch->addUpdateField(
              selectedDateActionLogDoc,
              itemPathWithField(selectedItem.parentId, "firstChildId"),
              addingItemId,
            )
          }
        } else {
          writeBatch->addUpdateField(
            selectedDateActionLogDoc,
            itemPathWithField(selectedItem.prevId, "nextId"),
            addingItemId,
          )
        }

      | Action.Next() =>
        writeBatch->addUpdateField(
          selectedDateActionLogDoc,
          itemPathWithField(selectedItem.id, "nextId"),
          addingItemId,
        )

        writeBatch->addUpdateField(
          selectedDateActionLogDoc,
          itemPath(addingItemId),
          {
            "firstChildId": "",
            "lastChildId": "",
            "prevId": selectedItem.id,
            "parentId": selectedItem.parentId,
            "nextId": selectedItem.nextId,
            "text": "",
          },
        )

        if selectedItem.nextId == "" {
          if selectedItem.parentId != "" {
            writeBatch->addUpdateField(
              selectedDateActionLogDoc,
              itemPathWithField(selectedItem.parentId, "lastChildId"),
              addingItemId,
            )
          }
        } else {
          writeBatch->addUpdateField(
            selectedDateActionLogDoc,
            itemPathWithField(selectedItem.nextId, "prevId"),
            addingItemId,
          )
        }
      }

      Reductive.Store.dispatch(
        store,
        Action.ActionLog(
          Action.SetSelectedActionLogItem({
            selectedActionLogItemId: addingItemId,
            initialCursorPosition: State.Start(),
          }),
        ),
      )

      writeBatch->commit

    | None => ()
    }

  | Action.Delete() =>
    switch state->Selector.ActionLog.selectedActionLogItem {
    | Some(selectedDateActionLog, selectedActionLog, selectedItem) =>
      open Firebase.Firestore

      let db = Firebase.firestore
      let writeBatch = db->writeBatch
      let selectedDateActionLogDoc = db->collection("dateActionLogs")->doc(selectedDateActionLog.id)

      let itemPath = id => fieldPath4("actionLogs", selectedActionLog.id, "items", id)
      let itemPathWithField = (id, field) =>
        fieldPath5("actionLogs", selectedActionLog.id, "items", id, field)

      writeBatch->addUpdateField(selectedDateActionLogDoc, itemPath(selectedItem.id), deleteField())

      let {parentId, prevId, nextId} = selectedItem

      if prevId == "" {
        if parentId != "" {
          writeBatch->addUpdateField(
            selectedDateActionLogDoc,
            itemPathWithField(parentId, "firstChildId"),
            nextId,
          )
        }
      } else {
        writeBatch->addUpdateField(
          selectedDateActionLogDoc,
          itemPathWithField(prevId, "nextId"),
          nextId,
        )
      }

      if nextId == "" {
        if parentId != "" {
          writeBatch->addUpdateField(
            selectedDateActionLogDoc,
            itemPathWithField(parentId, "lastChildId"),
            prevId,
          )
        }
      } else {
        writeBatch->addUpdateField(
          selectedDateActionLogDoc,
          itemPathWithField(nextId, "prevId"),
          prevId,
        )
      }

      writeBatch->commit

    | None => ()
    }

  | Indent() =>
    switch state->Selector.ActionLog.selectedActionLogItem {
    | Some({id: dateActionLogId}, {id: actionLogId, itemMap}, {id, parentId, prevId, nextId}) =>
      open Firebase.Firestore

      let db = Firebase.firestore
      let writeBatch = db->writeBatch
      let dateActionLogDoc = db->collection("dateActionLogs")->doc(dateActionLogId)

      let itemPath = (id, field) => fieldPath5("actionLogs", actionLogId, "items", id, field)

      switch state.mode {
      | State.Insert(_) =>
        writeBatch->addUpdateField(dateActionLogDoc, itemPath(id, "text"), state.editor.editingText)

      | _ => ()
      }

      switch itemMap->Map.String.get(prevId) {
      | Some({lastChildId: prevLastChildId}) =>
        if prevLastChildId == "" {
          writeBatch->addUpdateField(dateActionLogDoc, itemPath(id, "parentId"), prevId)
          writeBatch->addUpdateField(dateActionLogDoc, itemPath(id, "prevId"), "")
          writeBatch->addUpdateField(dateActionLogDoc, itemPath(id, "nextId"), "")

          writeBatch->addUpdateField(dateActionLogDoc, itemPath(prevId, "nextId"), nextId)
          writeBatch->addUpdateField(dateActionLogDoc, itemPath(prevId, "firstChildId"), id)
          writeBatch->addUpdateField(dateActionLogDoc, itemPath(prevId, "lastChildId"), id)
        } else {
          writeBatch->addUpdateField(dateActionLogDoc, itemPath(id, "parentId"), prevId)
          writeBatch->addUpdateField(dateActionLogDoc, itemPath(id, "prevId"), prevLastChildId)
          writeBatch->addUpdateField(dateActionLogDoc, itemPath(id, "nextId"), "")

          writeBatch->addUpdateField(dateActionLogDoc, itemPath(prevId, "nextId"), nextId)
          writeBatch->addUpdateField(dateActionLogDoc, itemPath(prevId, "lastChildId"), id)

          writeBatch->addUpdateField(dateActionLogDoc, itemPath(prevLastChildId, "nextId"), id)
        }

        if nextId == "" {
          if parentId != "" {
            writeBatch->addUpdateField(dateActionLogDoc, itemPath(parentId, "lastChildId"), prevId)
          }
        } else {
          writeBatch->addUpdateField(dateActionLogDoc, itemPath(nextId, "prevId"), prevId)
        }

      | None => ()
      }

      writeBatch->commit

    | None => ()
    }

  | Dedent() =>
    switch state->Selector.ActionLog.selectedActionLogItem {
    | Some({id: dateActionLogId}, {id: actionLogId, itemMap}, {id, parentId, prevId, nextId}) =>
      open Firebase.Firestore

      let db = Firebase.firestore
      let writeBatch = db->writeBatch
      let dateActionLogDoc = db->collection("dateActionLogs")->doc(dateActionLogId)

      let itemPath = (id, field) => fieldPath5("actionLogs", actionLogId, "items", id, field)

      switch state.mode {
      | State.Insert(_) =>
        writeBatch->addUpdateField(dateActionLogDoc, itemPath(id, "text"), state.editor.editingText)

      | _ => ()
      }

      switch itemMap->Map.String.get(parentId) {
      | Some({parentId: parentParentId, nextId: parentNextId}) if parentParentId != "" =>
        writeBatch->addUpdateField(dateActionLogDoc, itemPath(id, "parentId"), parentParentId)
        writeBatch->addUpdateField(dateActionLogDoc, itemPath(id, "prevId"), parentId)
        writeBatch->addUpdateField(dateActionLogDoc, itemPath(id, "nextId"), parentNextId)

        writeBatch->addUpdateField(dateActionLogDoc, itemPath(parentId, "nextId"), id)

        if nextId == "" {
          writeBatch->addUpdateField(dateActionLogDoc, itemPath(parentId, "lastChildId"), prevId)
        } else {
          writeBatch->addUpdateField(dateActionLogDoc, itemPath(nextId, "prevId"), prevId)
        }

        if prevId == "" {
          writeBatch->addUpdateField(dateActionLogDoc, itemPath(parentId, "firstChildId"), nextId)
        } else {
          writeBatch->addUpdateField(dateActionLogDoc, itemPath(prevId, "nextId"), nextId)
        }

        if parentNextId == "" {
          writeBatch->addUpdateField(dateActionLogDoc, itemPath(parentParentId, "lastChildId"), id)
        } else {
          writeBatch->addUpdateField(dateActionLogDoc, itemPath(parentNextId, "prevId"), id)
        }

      | _ => ()
      }

      writeBatch->commit

    | None => ()
    }
  }
}

let middleware = (store: Redux.Store.t, action: Action.firestoreActionLog) => {
  let state = Reductive.Store.getState(store)

  switch action {
  | Action.Record(recordAction) => recordMiddleware(store, recordAction)

  | Action.Items(itemsAction) => itemsMiddleware(store, itemsAction)

  | Action.Add({direction}) =>
    switch state->Selector.ActionLog.selectedActionLog {
    | Some((selectedDateActionLog, selectedActionLog)) =>
      open Firebase.Firestore

      let db = Firebase.firestore
      let writeBatch = db->writeBatch
      let dateActionLogs = db->collection("dateActionLogs")
      let selectedDateActionLogDoc = dateActionLogs->doc(selectedDateActionLog.id)

      let addingActionLogId = uuidv4()
      let newRootItemId = uuidv4()
      let newItemId = uuidv4()

      let nextSelectedDateActionLogId = switch direction {
      | Action.Next() =>
        let now = Date.now()
        let selectedDateActionLogDate = Date.fromString(selectedDateActionLog.date)
        let initialBegin = selectedActionLog.end

        switch state.mode {
        | State.Insert(_) =>
          writeBatch->addUpdateField(
            selectedDateActionLogDoc,
            fieldPath3("actionLogs", selectedActionLog.id, "text"),
            state.editor.editingText,
          )
        | _ => ()
        }

        if (
          selectedDateActionLog.nextId == "" &&
          selectedActionLog.nextId == "" &&
          selectedDateActionLogDate->Date.before(now)
        ) {
          let newDateActionLogId = uuidv4()

          writeBatch->addSet(
            dateActionLogs->doc(newDateActionLogId),
            {
              "date": now->Date.formatDate,
              "prevId": selectedDateActionLog.id,
              "nextId": "",
              "actionLogs": Js.Dict.fromList(list{
                (
                  addingActionLogId,
                  {
                    "begin": initialBegin,
                    "end": 0,
                    "prevId": "",
                    "nextId": "",
                    "text": "",
                    "items": Js.Dict.fromList(list{
                      (
                        newRootItemId,
                        {
                          "firstChildId": newItemId,
                          "lastChildId": newItemId,
                          "prevId": "",
                          "parentId": "",
                          "nextId": "",
                          "text": "",
                        },
                      ),
                      (
                        newItemId,
                        {
                          "firstChildId": "",
                          "lastChildId": "",
                          "prevId": "",
                          "parentId": newRootItemId,
                          "nextId": "",
                          "text": "",
                        },
                      ),
                    }),
                  },
                ),
              }),
            },
          )

          writeBatch->addUpdateField(
            selectedDateActionLogDoc,
            fieldPath1("nextId"),
            newDateActionLogId,
          )

          newDateActionLogId
        } else {
          writeBatch->addUpdateField(
            selectedDateActionLogDoc,
            fieldPath2("actionLogs", addingActionLogId),
            {
              "begin": initialBegin,
              "end": 0,
              "prevId": selectedActionLog.id,
              "nextId": selectedActionLog.nextId,
              "text": "",
              "items": Js.Dict.fromList(list{
                (
                  newRootItemId,
                  {
                    "firstChildId": newItemId,
                    "lastChildId": newItemId,
                    "prevId": "",
                    "parentId": "",
                    "nextId": "",
                    "text": "",
                  },
                ),
                (
                  newItemId,
                  {
                    "firstChildId": "",
                    "lastChildId": "",
                    "prevId": "",
                    "parentId": newRootItemId,
                    "nextId": "",
                    "text": "",
                  },
                ),
              }),
            },
          )

          writeBatch->addUpdateField(
            selectedDateActionLogDoc,
            fieldPath3("actionLogs", selectedActionLog.id, "nextId"),
            addingActionLogId,
          )

          if selectedActionLog.nextId != "" {
            writeBatch->addUpdateField(
              selectedDateActionLogDoc,
              fieldPath3("actionLogs", selectedActionLog.nextId, "prevId"),
              addingActionLogId,
            )
          }

          selectedDateActionLog.id
        }

      | Action.Prev() =>
        writeBatch->addUpdateField(
          selectedDateActionLogDoc,
          fieldPath2("actionLogs", addingActionLogId),
          {
            "begin": 0,
            "end": 0,
            "prevId": selectedActionLog.prevId,
            "nextId": selectedActionLog.id,
            "text": "",
            "items": Js.Dict.fromList(list{
              (
                newRootItemId,
                {
                  "firstChildId": newItemId,
                  "lastChildId": newItemId,
                  "prevId": "",
                  "parentId": "",
                  "nextId": "",
                  "text": "",
                },
              ),
              (
                newItemId,
                {
                  "firstChildId": "",
                  "lastChildId": "",
                  "prevId": "",
                  "parentId": newRootItemId,
                  "nextId": "",
                  "text": "",
                },
              ),
            }),
          },
        )

        writeBatch->addUpdateField(
          selectedDateActionLogDoc,
          fieldPath3("actionLogs", selectedActionLog.id, "prevId"),
          addingActionLogId,
        )

        if selectedActionLog.prevId != "" {
          writeBatch->addUpdateField(
            selectedDateActionLogDoc,
            fieldPath3("actionLogs", selectedActionLog.prevId, "nextId"),
            addingActionLogId,
          )
        }

        selectedDateActionLog.id
      }

      writeBatch->commit

      Reductive.Store.dispatch(
        store,
        Action.ActionLog(
          Action.SetSelectedActionLog({
            selectedDateActionLogId: nextSelectedDateActionLogId,
            selectedActionLogId: addingActionLogId,
            initialCursorPosition: State.Start(),
          }),
        ),
      )

    | None => ()
    }

  | Action.Delete() =>
    switch state->Selector.ActionLog.selectedActionLog {
    | Some(selectedDateActionLog, selectedActionLog) =>
      open Firebase.Firestore

      let db = Firebase.firestore
      let writeBatch = db->writeBatch
      let dateActionLogs = db->collection("dateActionLogs")
      let selectedDateActionLogDoc = dateActionLogs->doc(selectedDateActionLog.id)

      writeBatch->addUpdateField(
        selectedDateActionLogDoc,
        fieldPath2("actionLogs", selectedActionLog.id),
        deleteField(),
      )

      if selectedActionLog.prevId != "" {
        writeBatch->addUpdateField(
          selectedDateActionLogDoc,
          fieldPath3("actionLogs", selectedActionLog.prevId, "nextId"),
          selectedActionLog.nextId,
        )
      }

      if selectedActionLog.nextId != "" {
        writeBatch->addUpdateField(
          selectedDateActionLogDoc,
          fieldPath3("actionLogs", selectedActionLog.nextId, "prevId"),
          selectedActionLog.prevId,
        )
      }

      writeBatch->commit

    | None => ()
    }

  | Action.Start() =>
    switch state->Selector.ActionLog.selectedActionLog {
    | Some((selectedDateActionLog, selectedActionLog)) if selectedActionLog.begin == 0.0 =>
      open Firebase.Firestore

      let dateActionLogs = Firebase.firestore->collection("dateActionLogs")

      switch state->Selector.ActionLog.aboveSelectedActionLogAcrossRecentDateActionLogs {
      | Some(aboveActionLog) if aboveActionLog.end != 0.0 =>
        dateActionLogs
        ->doc(selectedDateActionLog.id)
        ->updateField(fieldPath3("actionLogs", selectedActionLog.id, "begin"), aboveActionLog.end)

      | _ =>
        dateActionLogs
        ->doc(selectedDateActionLog.id)
        ->updateField(
          fieldPath3("actionLogs", selectedActionLog.id, "begin"),
          Date.now()->Date.toUnixtimeMillis,
        )
      }

    | _ => ()
    }

  | Action.Finish() =>
    switch state->Selector.ActionLog.selectedActionLog {
    | Some((selectedDateActionLog, selectedActionLog)) if selectedActionLog.end == 0.0 =>
      open Firebase.Firestore

      let dateActionLogs = Firebase.firestore->collection("dateActionLogs")

      dateActionLogs
      ->doc(selectedDateActionLog.id)
      ->updateField(
        fieldPath3("actionLogs", selectedActionLog.id, "end"),
        Date.now()->Date.toUnixtimeMillis,
      )

    | _ => ()
    }
  }
}
