open Belt

module SetInitialSelectedDocumentId = {
  @react.component
  let make = () => {
    let dispatch = Redux.useDispatch()
    let rootDocument = Redux.useSelector(Selector.Firestore.rootDocument)
    let isInitial = Redux.useSelector(Selector.Note.DocumentPane.isInitial)

    React.useEffect(() => {
      if isInitial {
        switch rootDocument {
        | Some(rootDocument: State.noteDocument) =>
          dispatch(
            Action.SetNoteDocumentPaneState({
              selectedId: rootDocument.firstChildId,
            }),
          )

        | None => ()
        }
      }

      None
    })

    React.null
  }
}

module SetInitialSelectedActionLog = {
  let getInitialSelectedIds = latestDateActionLog => {
    latestDateActionLog->Option.flatMap((dateActionLog: State.dateActionLog) => {
      dateActionLog.actionLogMap
      ->Map.String.get(dateActionLog.latestActionLogId)
      ->Option.map((actionLog: State.actionLog) => {
        (dateActionLog.id, actionLog.id)
      })
    })
  }

  @react.component
  let make = () => {
    let dispatch = Redux.useDispatch()
    let latestDateActionLog = Redux.useSelector(Selector.Firestore.latestDateActionLog)
    let isInitial = Redux.useSelector(Selector.ActionLog.isInitial)

    React.useEffect(() => {
      if isInitial {
        switch latestDateActionLog->getInitialSelectedIds {
        | Some((initialSelectedDateActionLogId, initialSelectedActionLogId)) =>
          dispatch(
            Action.SetActionLogState({
              selectedDateActionLogId: initialSelectedDateActionLogId,
              selectedActionLogId: initialSelectedActionLogId,
            }),
          )

        | None => ()
        }
      }
      None
    })

    React.null
  }
}

@react.component
let make = () => <> <SetInitialSelectedDocumentId /> <SetInitialSelectedActionLog /> </>
