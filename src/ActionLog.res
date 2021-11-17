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

module SetActionLogOldestRecentDateActionLogId = {
  let getOldestRecentDateActionLogId = (dateActionLogMap, latestDateActionLogId) => {
    let rec walk = (dateActionLogId, n) => {
      if n == Config.recentDateActionLogsNum {
        dateActionLogId
      } else {
        switch dateActionLogMap->Map.String.get(dateActionLogId) {
        | Some(dateActionLog: State.dateActionLog) => walk(dateActionLog.prevId, n + 1)

        | None => dateActionLogId
        }
      }
    }

    walk(latestDateActionLogId, 1)
  }

  @react.component
  let make = () => {
    let dispatch = Redux.useDispatch()
    let dateActionLogMap = Redux.useSelector(State.Firestore.dateActionLogMap)
    let latestDateActionLogId = Redux.useSelector(State.Firestore.latestDateActionLogId)

    React.useEffect(() => {
      dispatch(
        Action.SetActionLogOldestRecentDateActionLogId({
          oldestRecentDateActionLogId: getOldestRecentDateActionLogId(
            dateActionLogMap,
            latestDateActionLogId,
          ),
        }),
      )

      None
    })

    React.null
  }
}

@react.component
let make = () => {
  <>
    <ActionLogRecentDateActionLogs />
    <SetInitialSelectedActionLog />
    <SetActionLogOldestRecentDateActionLogId />
  </>
}
