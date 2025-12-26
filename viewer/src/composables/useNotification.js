import { Notyf } from 'notyf'

const notyf = new Notyf({
  duration: 3500,
  position: { x: 'right', y: 'top' },
  ripple: false,
  dismissible: true
})

export function useNotification() {
  return notyf
}

