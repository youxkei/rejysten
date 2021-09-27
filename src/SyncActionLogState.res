@react.component
let make = () => {
  let dispatch = Redux.useDispatch()
  let dateActionLogMap = Redux.useSelector(State.Firestore.dateActionLogMap)

  React.useEffect1(() => {
    dispatch(
      Action.SetActionLogState({
        dateActionLogMap: dateActionLogMap,
      }),
    )

    None
  }, [dateActionLogMap])

  React.null
}
