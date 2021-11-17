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
  }
}
