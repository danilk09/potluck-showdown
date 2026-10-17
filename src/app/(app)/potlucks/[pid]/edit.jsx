import { useLocalSearchParams } from 'expo-router';
import PotluckForm from '../../../../components/PotluckForm';

export default function EditPotluck() {
  const { pid } = useLocalSearchParams();
  return <PotluckForm pid={pid} />;
}
