open Belt

module SetInitialSelectedActionLog = {
  let getInitialSelectedActionLogId = latestDateActionLog => {
    latestDateActionLog->Option.flatMap((dateActionLog: State.dateActionLog) => {
      dateActionLog.actionLogMap
      ->Map.String.get(dateActionLog.latestActionLogId)
      ->Option.map((actionLog: State.actionLog) => {
        actionLog.id
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
        switch latestDateActionLog->getInitialSelectedActionLogId {
        | Some(initialSelectedActionLogId) =>
          dispatch(
            Action.SetActionLogState({
              selectedId: initialSelectedActionLogId,
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
