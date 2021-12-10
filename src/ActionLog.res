open Belt

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
    let dateActionLogMap = Redux.useSelector(Selector.Firestore.dateActionLogMap)
    let latestDateActionLogId = Redux.useSelector(Selector.Firestore.latestDateActionLogId)

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
let make = (~focus) => {
  <>
    <main className=Style.ActionLog.style> <ActionLogRecentDateActionLogs focus /> </main>
    <SetActionLogOldestRecentDateActionLogId />
  </>
}
