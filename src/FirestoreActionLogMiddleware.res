@module("uuid") external uuidv4: unit => string = "v4"

let middleware = (store: Redux.Store.t, action: Action.firestoreActionLog) => {
  let state = Reductive.Store.getState(store)

  switch action {
  | Action.SaveActionLog() =>
    switch state->State.ActionLog.selectedActionLog {
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

  | Action.AddActionLog({direction}) =>
    switch state->State.ActionLog.selectedActionLog {
    | Some((selectedDateActionLog, selectedActionLog)) =>
      switch state->State.Firestore.latestActionLog {
      | Some(latestActionLog) =>
        open Firebase.Firestore

        let db = Firebase.firestore
        let writeBatch = db->writeBatch
        let dateActionLogs = db->collection("dateActionLogs")

        let addingActionLogId = uuidv4()

        let nextSelectedDateActionLogId = switch direction {
        | Action.Next() =>
          let now = Date.now()
          let selectedDateActionLogDate = Date.fromString(selectedDateActionLog.date)

          switch state.mode {
          | State.Insert(_) =>
            writeBatch->addUpdateField(
              dateActionLogs->doc(selectedDateActionLog.id),
              fieldPath3("actionLogs", selectedActionLog.id, "text"),
              state.editor.editingText,
            )
          | _ => ()
          }

          if (
            latestActionLog.id == selectedActionLog.id &&
              selectedDateActionLogDate->Date.before(now)
          ) {
            let newDateActionLogId = uuidv4()
            let newRootItemId = uuidv4()
            let newItemId = uuidv4()

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
                      "begin": 0,
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
              dateActionLogs->doc(selectedDateActionLog.id),
              fieldPath1("nextId"),
              newDateActionLogId,
            )

            newDateActionLogId
          } else {
            let newRootItemId = uuidv4()
            let newItemId = uuidv4()

            writeBatch->addUpdateField(
              dateActionLogs->doc(selectedDateActionLog.id),
              fieldPath2("actionLogs", addingActionLogId),
              {
                "begin": 0,
                "end": 0,
                "prevId": selectedActionLog.id,
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
            )

            writeBatch->addUpdateField(
              dateActionLogs->doc(selectedDateActionLog.id),
              fieldPath3("actionLogs", selectedActionLog.id, "nextId"),
              addingActionLogId,
            )

            selectedDateActionLog.id
          }

        | Action.Prev() => selectedDateActionLog.id
        }

        writeBatch->commit

        Reductive.Store.dispatch(
          store,
          Action.ActionLog(
            Action.SetState({
              selectedDateActionLogId: nextSelectedDateActionLogId,
              selectedActionLogId: addingActionLogId,
            }),
          ),
        )

      | _ => ()
      }

    | None => ()
    }

  | Action.StartActionLog() =>
    switch state->State.ActionLog.selectedActionLog {
    | Some((selectedDateActionLog, selectedActionLog)) if selectedActionLog.begin == 0.0 =>
      open Firebase.Firestore

      let dateActionLogs = Firebase.firestore->collection("dateActionLogs")

      switch state->State.ActionLog.aboveRecentActionLog {
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

  | Action.FinishActionLog() =>
    switch state->State.ActionLog.selectedActionLog {
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
