open Belt

@send
external getBoundingClientRect: Dom.element => {
  "left": int,
  "right": int,
  "top": int,
  "bottom": int,
} = "getBoundingClientRect"
@send
external scrollIntoView: (Dom.element, {"block": string}) => unit = "scrollIntoView"

module Record = {
  @react.component
  let make = (~actionLog: State.actionLog, ~isSelectedActionLog, ()) => {
    let dispatch = Redux.useDispatch()
    let mode = Redux.useSelector(Selector.mode)
    let focus = Redux.useSelector(Selector.focus)
    let innerHeight = Hook.useInnerHeight()
    let recordRef = React.useRef(Js.Nullable.null)

    let textOnClick = Hook.useDouble(React.useCallback2((event, isDouble) => {
        dispatch(
          Action.Event(
            Event.Click({
              event: Event.Mouse(event),
              isDouble: isDouble,
              target: Event.ActionLog({
                dateActionLogId: actionLog.dateActionLogId,
                actionLogId: actionLog.id,
                target: Event.RecordText(),
              }),
            }),
          ),
        )
      }, (actionLog.dateActionLogId, actionLog.id)))

    let beginOnClick = Hook.useDouble(React.useCallback2((event, isDouble) => {
        dispatch(
          Action.Event(
            Event.Click({
              event: Event.Mouse(event),
              isDouble: isDouble,
              target: Event.ActionLog({
                dateActionLogId: actionLog.dateActionLogId,
                actionLogId: actionLog.id,
                target: Event.RecordBegin(),
              }),
            }),
          ),
        )
      }, (actionLog.dateActionLogId, actionLog.id)))

    let endOnClick = Hook.useDouble(React.useCallback2((event, isDouble) => {
        dispatch(
          Action.Event(
            Event.Click({
              event: Event.Mouse(event),
              isDouble: isDouble,
              target: Event.ActionLog({
                dateActionLogId: actionLog.dateActionLogId,
                actionLogId: actionLog.id,
                target: Event.RecordEnd(),
              }),
            }),
          ),
        )
      }, (actionLog.dateActionLogId, actionLog.id)))

    React.useEffect2(() => {
      if isSelectedActionLog {
        switch recordRef.current->Js.Nullable.toOption {
        | Some(record) =>
          let rect = record->getBoundingClientRect

          if rect["top"] < Style.globalMargin {
            record->scrollIntoView({"block": "start"})
          }

          if rect["bottom"] > innerHeight - Style.ButtonBar.height {
            record->scrollIntoView({"block": "end"})
          }

        | None => ()
        }
      }

      None
    }, (isSelectedActionLog, innerHeight))

    let {text, begin, end} = actionLog
    let text = text->React.string
    let beginTime = begin->Date.fromUnixtimeMillis->Date.getTimeStringForDisplay->React.string
    let endTime = end->Date.fromUnixtimeMillis->Date.getTimeStringForDisplay->React.string

    <div className=Style.ActionLog.actionLog ref={ReactDOM.Ref.domRef(recordRef)}>
      {switch mode {
      | State.Insert(_) if isSelectedActionLog => <>
          <p>
            {switch focus {
            | State.ActionLog(State.Record(State.Text())) => <Editor />
            | _ => text
            }}
          </p>
          <p>
            <span>
              {switch focus {
              | State.ActionLog(State.Record(Begin())) => <Editor inline=true />

              | _ => beginTime
              }}
            </span>
            <span> {` → `->React.string} </span>
            <span>
              {switch focus {
              | State.ActionLog(State.Record(End())) => <Editor inline=true />

              | _ => endTime
              }}
            </span>
          </p>
        </>

      | _ => <>
          <p onClick=textOnClick> {text} </p>
          <p>
            <span onClick=beginOnClick> {beginTime} </span>
            <span> {` → `->React.string} </span>
            <span onClick=endOnClick> {endTime} </span>
          </p>
        </>
      }}
    </div>
  }
}

@react.component
let make = (~actionLog: State.actionLog, ~focus, ()) => {
  let selectedId = Redux.useSelector(Selector.ActionLog.selectedActionLogId)
  let selectedActionLogItemId = Redux.useSelector(Selector.ActionLog.selectedActionLogItemId)

  let {id, dateActionLogId, itemMap, rootItemId} = actionLog
  let (isSelectedActionLog, focusable) = switch focus {
  | State.Record(_) => (id == selectedId, false)
  | State.Items() => (false, true)
  }

  let clickEventTargetCreator = itemId => Event.ActionLog({
    dateActionLogId: dateActionLogId,
    actionLogId: id,
    target: Event.Item({itemId: itemId}),
  })

  <BulletList
    bullet={<Bullet />}
    item={<Record actionLog isSelectedActionLog />}
    isSelectedItem=isSelectedActionLog
    child={switch itemMap->Map.String.get(rootItemId) {
    | Some(rootItem) =>
      <Items
        editable=true
        focusable
        item=rootItem
        selectedItemId=selectedActionLogItemId
        itemMap
        clickEventTargetCreator
      />

    | None => React.null
    }}
  />
}
