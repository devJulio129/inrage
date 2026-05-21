import { Member } from '../models/Member.js'

export async function listMembers(req, res, next) {
  try{
   const members = await Member.find()
   res.json(members);
  } catch(err) {
    next(err);
  }
};

export async function getMember(req, res, next) {
    try{
        const member = await Member.findById(req.params.id)
    if(!member) {
        return res.status(404).json({ error: 'Member not found'})
    }
    res.json(member);
    } catch(err){
        next(err);
    }
}

export async function createMember(req, res, next){
    try{
        const member = await Member.create(req.body);
        res.status(201).json(member);
    } catch (err){
        next(err);
    }
}