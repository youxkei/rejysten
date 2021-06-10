type props = {
  "className": string,
  "ref": ReactDOM.Ref.t,
  "value": string,
  "onChange": ReactEvent.Form.t => unit,
  "onBlur": ReactEvent.Form.t => unit,
}

@obj
external makeProps: (
  ~className: string,
  ~ref: ReactDOM.Ref.t,
  ~value: string,
  ~onChange: ReactEvent.Form.t => unit,
  ~onBlur: ReactEvent.Form.t => unit,
  unit,
) => props = ""
@module("react-textarea-autosize") external make: React.component<props> = "default"
