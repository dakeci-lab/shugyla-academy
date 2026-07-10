import EmployeeAvatar from './EmployeeAvatar'

/** @deprecated Используйте EmployeeAvatar */
export default function CandidateAvatar(props) {
  return <EmployeeAvatar {...props} />
}

export { getCandidateInitials } from '../services/candidatePhotoService'
