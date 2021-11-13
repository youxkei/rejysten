open Belt

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
    let latestDateActionLog = Redux.useSelector(State.Firestore.latestDateActionLog)
    let isInitial = Redux.useSelector(State.ActionLog.isInitial)

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
let make = () => {
  <> <ActionLogRecentDateActionLogs /> <SetInitialSelectedActionLog /> </>
}
