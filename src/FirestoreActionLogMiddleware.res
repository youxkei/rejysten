open Belt

@module("uuid") external uuidv4: unit => string = "v4"

let before = (lhs, rhs) => {
  open Js.Date

  let lhsYear = lhs->getFullYear
  let rhsYear = rhs->getFullYear
  let lhsMonth = lhs->getMonth
  let rhsMonth = rhs->getMonth
  let lhsDate = lhs->getDate
  let rhsDate = rhs->getDate

  if lhsYear < rhsYear {
    true
  } else if lhsYear > rhsYear {
    false
  } else if lhsMonth < rhsMonth {
    true
  } else if lhsMonth > rhsMonth {
    false
  } else if lhsDate < rhsDate {
    true
  } else if lhsDate > rhsDate {
    false
  } else {
    false
  }
}

let formatDate = date => {
  open Js.Date

  `${date->getFullYear->Int.fromFloat->Int.toString}-${(date->getMonth->Int.fromFloat + 1)
      ->Int.toString}-${date->getDate->Int.fromFloat->Int.toString}`
}

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
          let now = Js.Date.make()
          let selectedDateActionLogDate = Js.Date.fromString(selectedDateActionLog.date)

          switch state.mode {
          | State.Insert(_) =>
            writeBatch->addUpdateField(
              dateActionLogs->doc(selectedDateActionLog.id),
              fieldPath3("actionLogs", selectedActionLog.id, "text"),
              state.editor.editingText,
            )
          | _ => ()
          }

          if latestActionLog.id == selectedActionLog.id && selectedDateActionLogDate->before(now) {
            let newDateActionLogId = uuidv4()
            let newRootItemId = uuidv4()
            let newItemId = uuidv4()

            writeBatch->addSet(
              dateActionLogs->doc(newDateActionLogId),
              {
                "date": now->formatDate,
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
  }
}
