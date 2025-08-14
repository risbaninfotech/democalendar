import mongoose, {Schema, model} from 'mongoose';

const statusSchema = new Schema({
    name: {
        type: String,
        required: true,
    },
    color: {
        type: String,
        required: true,
    }
});

const Status = model('Status', statusSchema);
export default Status;