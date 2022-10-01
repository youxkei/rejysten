import { useSelector, useDispatch } from "@/store";
import { rxdbSync } from "@/slices/rxdbSync";

export function RxdbSyncConfig() {
  const dispatch = useDispatch();
  const { domain, user, pass, syncing, errors } = useSelector(
    (state) => state.rxdbSync
  );

  const onDomainChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    dispatch(rxdbSync.actions.updateDomain({ domain: event.target.value }));
  };

  const onUserChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    dispatch(rxdbSync.actions.updateUser({ user: event.target.value }));
  };

  const onPassChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    dispatch(rxdbSync.actions.updatePass({ pass: event.target.value }));
  };

  const onClick = () => {
    dispatch(rxdbSync.actions.startSync());
  };

  return (
    <>
      <div>
        <input value={domain} onChange={onDomainChange} />
        <input value={user} onChange={onUserChange} />
        <input value={pass} onChange={onPassChange} />
        <button disabled={syncing} onClick={onClick}>
          start sync
        </button>
      </div>
      <span>{errors}</span>
    </>
  );
}
