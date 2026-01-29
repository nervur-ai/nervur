import { CheckIcon, ErrorIcon, WarnIcon, Spinner } from './icons.jsx'

export default function CheckItem({ check }) {
  return (
    <div className="flex items-start gap-3 py-3">
      <div className="mt-0.5">
        {check.status === 'pass' && <CheckIcon />}
        {check.status === 'fail' && <ErrorIcon />}
        {check.status === 'warn' && <WarnIcon />}
        {check.status === 'checking' && <Spinner />}
        {!check.status && <div className="w-5 h-5 rounded-full border-2 border-gray-200" />}
      </div>
      <div className="flex-1">
        <p className={`font-medium ${check.status ? 'text-gray-900' : 'text-gray-400'}`}>{check.label}</p>
        {check.message && <p className="text-sm text-gray-500">{check.message}</p>}
        {check.help && check.status === 'fail' && (
          <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-800">{check.help}</p>
          </div>
        )}
        {check.help && check.status === 'warn' && (
          <div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-800">{check.help}</p>
          </div>
        )}
      </div>
    </div>
  )
}
